import { id } from "@instantdb/react";
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
  { rating: Rating.Again, label: "Again" },
  { rating: Rating.Hard, label: "Hard" },
  { rating: Rating.Good, label: "Good" },
  { rating: Rating.Easy, label: "Easy" },
] as const;

/** The `ts-fsrs` Card as it is stored: dates flattened to unix ms. */
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

/** Cards due within the next 24h that aren't due yet — "later today". */
export function dueSoon(
  cards: StudyCard[],
  lineId: string,
  now = Date.now(),
): number {
  return cards.filter(
    (c) =>
      inLine(c, lineId) && c.srs && c.srs.due > now && c.srs.due <= now + 864e5,
  ).length;
}

function logEntry(
  lineId: string,
  kind: string,
  amount: number,
  extra: Record<string, unknown> = {},
) {
  return { [id()]: { at: Date.now(), lineId, kind, amount, ...extra } };
}

/**
 * Answer a card: advance its FSRS state and append a `rate` event recording
 * the transition, so the log alone can feed a parameter optimizer later.
 */
export async function rateCard(
  card: StudyCard,
  lineId: string,
  rating: Grade,
  typed = "",
  linkId = "",
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
        source: "session",
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
        srs: store(createEmptyCard(now)),
        log: logEntry(lineId, "introduce", 0),
      }),
    ),
  );
}

/**
 * Mark cards as already known: rate them Easy on sight, which schedules them
 * about a week out without making you sit through the learning steps. The
 * per-card fuzz seed keeps a batch from landing on the same day.
 */
export async function markKnown(
  cardIds: string[],
  lineId: string,
): Promise<void> {
  if (cardIds.length === 0) return;
  const now = Date.now();
  await db.transact(
    cardIds.map((cid) => {
      const { card } = scheduler.next(
        toInput({ id: cid }, now),
        now,
        Rating.Easy,
      );
      const srs = store(card);
      return db.tx.cards[cid].merge({
        srs,
        log: logEntry(lineId, "known", Rating.Easy, {
          sAfter: srs.stability,
          dAfter: srs.difficulty,
          dueIn: (srs.due - now) / 864e5,
          source: "triage",
        }),
      });
    }),
  );
}

/** Human-readable "when will I see this again", for the rating buttons. */
export function previewIntervals(
  card: StudyCard,
  now = Date.now(),
): Record<number, string> {
  const input = toInput(card, now);
  const out: Record<number, string> = {};
  for (const { rating } of RATINGS) {
    const { card: next } = scheduler.next(input, now, rating);
    out[rating] = formatGap(+next.due - now);
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
