import {
  fsrs,
  Rating,
  State,
  createEmptyCard,
  StrategyMode,
  GenSeedStrategyWithCardId,
  type Card as FsrsCard,
  type CardInput,
  type Grade,
} from "ts-fsrs";
import { db } from "../db";
import { freshSrs } from "./deck";
import { logEntry, type CardLog } from "./queue";

// Classic day-based spaced repetition on top of FSRS. A card carries the
// library's own Card state in `card.srs` (dates as unix ms) and the queue is
// simply "what is due now, soonest first" — no ranks, no positions.
//
// The fuzz seed is tied to the card id on purpose. With the default seed the
// randomness is derived from the card's *state*, so a batch of cards graded
// identically on the same day gets an identical "random" interval and moves
// through the deck as one clump — 200 cards marked Easy all landed on day 8.
// Seeding per card spreads that batch over 6-10 days instead.
const scheduler = fsrs({
  enable_fuzz: true,
  enable_short_term: true,
  request_retention: 0.9,
}).useStrategy(StrategyMode.SEED, GenSeedStrategyWithCardId("id"));

export { Rating, State };

export const RATINGS = [
  {
    rating: Rating.Again,
    label: "Again",
    hint: "Не вспомнил, подсмотрел, вспомнил не то. Сброс дешевле выученной ошибки, и он не обнуляет карточку, а откатывает.",
  },
  {
    rating: Rating.Hard,
    label: "Hard",
    hint: "Вспомнил верно, но с усилием, паузой или подсказкой.",
  },
  {
    rating: Rating.Good,
    label: "Good",
    hint: "Вспомнил. Обычный ответ, сюда попадает большинство.",
  },
  {
    rating: Rating.Easy,
    label: "Easy",
    hint: "Узнал сразу, спрашивать было незачем. Работает лучше на длинном сроке: на карточке, пришедшей через день, «легко» ничего не значит.",
  },
] as const;

/** A grade's colour, red→blue in the order the buttons sit in. Used by the
 *  review history on Learn; deliberately not the difficulty ramp, which asks a
 *  different question (how hard the card is, not how one answer went). */
export const GRADE_COLORS: Record<number, string> = {
  [Rating.Again]: "#dc2626",
  [Rating.Hard]: "#f59e0b",
  [Rating.Good]: "#16a34a",
  [Rating.Easy]: "#0ea5e9",
};

/** One past answer, as the history strip draws it. */
export interface GradedReview {
  at: number;
  /** `ts-fsrs` Rating, 1..4. */
  rating: number;
  /** Days until the card was scheduled next, as that answer set it. */
  dueIn?: number;
}

/**
 * A card's answers, oldest first, at most `limit` of them (the most recent
 * ones). `rate` is an answer from Learn, `known` the Easy that marking a card
 * known on sight writes — both carry a real grade in `amount`. Nothing else
 * does: the retired manual queue's `place` events carry a depth in that same
 * field, and drawing 250 as a grade would paint a colour that never happened.
 */
export function gradeHistory(log?: CardLog, limit = 20): GradedReview[] {
  return Object.values(log ?? {})
    .filter((e) => e.kind === "rate" || e.kind === "known")
    .sort((a, b) => a.at - b.at)
    .slice(-limit)
    .map((e) => ({
      at: e.at,
      rating: e.amount,
      dueIn: typeof e.dueIn === "number" ? e.dueIn : undefined,
    }));
}

/** The `ts-fsrs` Card as it is stored: dates flattened to unix ms. */
/** FSRS difficulty (1..10) as green→red. Lives here rather than next to one of
 *  its two callers: the Account chart and the card list have to agree on what
 *  "hard" looks like, or the same card reads as two different cards. */
export function difficultyColor(d: number): string {
  const t = Math.min(1, Math.max(0, (d - 1) / 9));
  return `hsl(${150 - t * 150} 62% ${58 - t * 10}%)`;
}

export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number | null;
}

/** Minimal shape the scheduler needs from a card. */
export interface StudyCard {
  id: string;
  srs?: SrsState;
  queues?: { [lineId: string]: { rank: string } };
}

function store(card: FsrsCard): SrsState {
  return {
    due: +card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? +card.last_review : null,
  };
}

const inLine = (c: StudyCard, lineId: string) =>
  c.queues?.[lineId]?.rank !== undefined;

/**
 * The card as `ts-fsrs` wants it, carrying its own id so the fuzz seed varies
 * per card. `id` is not part of `CardInput`, but the seed strategy reads it off
 * the object at runtime — hence the cast.
 */
function toInput(card: StudyCard, now: number): CardInput {
  const state = card.srs ?? createEmptyCard(now);
  return { ...state, id: card.id } as unknown as CardInput;
}

/** The line's cards that are due now, soonest first. */
export function dueCards<T extends StudyCard>(
  cards: T[],
  lineId: string,
  now = Date.now(),
): T[] {
  return cards
    .filter((c) => inLine(c, lineId) && c.srs && c.srs.due <= now)
    .sort((a, b) => a.srs!.due - b.srs!.due);
}

/** The line's cards that have never been taken into study. */
export function newPool<T extends StudyCard>(cards: T[], lineId: string): T[] {
  return cards.filter((c) => inLine(c, lineId) && !c.srs);
}

/** When the next card comes up, or null if nothing is scheduled at all. */
export function nextDueAt(cards: StudyCard[], lineId: string): number | null {
  const upcoming = cards
    .filter((c) => inLine(c, lineId) && c.srs)
    .map((c) => c.srs!.due);
  return upcoming.length ? Math.min(...upcoming) : null;
}

/** Cards that come back before midnight and aren't due yet — "later today".
 *  The window used to be a flat 24 hours, which at 22:00 counted most of
 *  tomorrow as today and had the Learn screen promise cards that weren't
 *  coming. */
export function dueSoon(
  cards: StudyCard[],
  lineId: string,
  now = Date.now(),
): number {
  const endOfDay = new Date(now).setHours(23, 59, 59, 999);
  return cards.filter(
    (c) =>
      inLine(c, lineId) && c.srs && c.srs.due > now && c.srs.due <= endOfDay,
  ).length;
}

/**
 * Answer a card: advance its FSRS state and append a `rate` event recording
 * the transition, so the log alone can feed a parameter optimizer later.
 *
 * `source` says where the answer came from: "session" is the Learn queue,
 * "field" is the word met in the wild and graded outside a session. FSRS
 * itself makes no distinction — it is for later, when the log is read back to
 * ask which reviews the schedule actually earned.
 */
export async function rateCard(
  card: StudyCard,
  lineId: string,
  rating: Grade,
  typed = "",
  linkId = "",
  source: "session" | "field" = "session",
): Promise<void> {
  const now = Date.now();
  const before = card.srs;
  // Answered early or late alike, the review happens "now" — FSRS works out
  // the elapsed time from the card's own last_review.
  const { card: next } = scheduler.next(toInput(card, now), now, rating);
  const srs = store(next);
  await db.transact(
    db.tx.cards[card.id].merge({
      srs,
      log: logEntry(lineId, "rate", rating, {
        typed,
        linkId,
        sBefore: before?.stability ?? null,
        dBefore: before?.difficulty ?? null,
        sAfter: srs.stability,
        dAfter: srs.difficulty,
        dueIn: (srs.due - now) / 864e5,
        source,
      }),
    }),
  );
}

/**
 * Take cards into study: they enter the queue as new and are asked at the next
 * session, learning steps and all.
 */
export async function introduce(
  cardIds: string[],
  lineId: string,
): Promise<void> {
  if (cardIds.length === 0) return;
  const now = Date.now();
  await db.transact(
    cardIds.map((cid) =>
      db.tx.cards[cid].merge({
        srs: freshSrs(now),
        log: logEntry(lineId, "introduce", 0),
      }),
    ),
  );
}

/**
 * What waits on the other side of the learning steps: the card walked through
 * whatever steps it has left, passing each one. Zero when the rating already
 * put the card in review and its own number is the whole answer.
 */
function settle(next: FsrsCard, cardId: string): number {
  const stepping = (c: FsrsCard) =>
    c.state === State.Learning || c.state === State.Relearning;
  if (!stepping(next)) return 0;
  let c = next;
  // Steps are few and short; the cap only guards against a configuration that
  // would never graduate.
  for (let i = 0; i < 5 && stepping(c); i++) {
    const at = +c.due;
    c = scheduler.next(
      { ...c, id: cardId } as unknown as CardInput,
      at,
      Rating.Good,
    ).card;
  }
  return +c.due - +next.due;
}

/**
 * Human-readable "when will I see this again", for the rating buttons.
 *
 * A rating that leaves the card in its learning steps answers that question
 * twice, and only the second answer is comparable to the other buttons: Again
 * on a mature card reads "10 мин" next to Good's "15 дн", which makes the one
 * rating that wipes 15 days of stability look like the cheap option. So a
 * button that only schedules a step prints the step *and* the interval behind
 * it — "10 мин → 1 д" against Good's "15 дн" is the real comparison.
 */
export function previewIntervals(
  card: StudyCard,
  now = Date.now(),
): Record<number, string> {
  const input = toInput(card, now);
  const out: Record<number, string> = {};
  for (const { rating } of RATINGS) {
    const { card: next } = scheduler.next(input, now, rating);
    const rest = settle(next, card.id);
    out[rating] = rest
      ? `${formatGap(+next.due - now)} → ${formatGap(rest)}`
      : formatGap(+next.due - now);
  }
  return out;
}

export function formatGap(ms: number): string {
  const min = ms / 6e4;
  if (min < 60) return `${Math.max(1, Math.round(min))} мин`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)} ч`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} дн`;
  const months = days / 30.4;
  if (months < 12) return `${months.toFixed(months < 3 ? 1 : 0)} мес`;
  return `${(days / 365).toFixed(1)} г`;
}

/** The cards falling due on each of the next `days` days, today first. */
export function dueForecast<T extends StudyCard>(
  cards: T[],
  days = 14,
  now = Date.now(),
): { date: Date; cards: T[] }[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const out = Array.from({ length: days }, (_, i) => ({
    date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + i),
    cards: [] as T[],
  }));
  for (const c of cards) {
    if (!c.srs) continue;
    const due = new Date(c.srs.due);
    due.setHours(0, 0, 0, 0);
    // Overdue cards are work for today, so they land in the first bucket.
    // Rounded, because a DST change inside the window shifts a day by an hour.
    const day = Math.max(0, Math.round((+due - +today) / 864e5));
    if (day < days) out[day].cards.push(c);
  }
  return out;
}
