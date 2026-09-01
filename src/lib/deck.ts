// Read-only views over a card and its history, shared by the MCP server. Pure
// on purpose: it lives here rather than next to the server because `src/lib` is
// the part that survives the move off InstantDB, and because the server itself
// opens a socket the moment it is imported, which no test wants.

/** `ts-fsrs` State by its numeric value. A card with no `srs` at all is in none
 *  of these: it has never been taken into study (the Deck page's pool). */
export const STATE = ["New", "Learning", "Review", "Relearning"];

/** `ts-fsrs` Rating. Index 0 is the library's `Manual`, which we never write. */
export const RATING = ["Manual", "Again", "Hard", "Good", "Easy"];

export interface Srs {
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number | null;
}

export interface LogEvent {
  at: number;
  lineId: string;
  kind: string;
  amount: number;
  [k: string]: unknown;
}

export interface DeckCard {
  id: string;
  aCard: string;
  bCard: string;
  note?: string;
  srs?: Srs;
  log?: Record<string, LogEvent>;
  queues?: Record<string, { rank: string }>;
}

export interface Brief {
  id: string;
  a: string;
  b: string;
  lines?: string[];
  state: string;
  due?: string;
  reps?: number;
  lapses?: number;
  stability?: number;
  difficulty?: number;
}

/** What a list returns: enough to decide on a card, not the whole row. Notes
 *  stay out: they hold a screenful of dictionary markup each, and 500 of them
 *  came to 215 KB — a list is for choosing which card to open, and `get_card`
 *  is what opens it. */
export function brief(c: DeckCard, lines: Record<string, string> = {}): Brief {
  const inLines = Object.keys(c.queues ?? {}).map((id) => lines[id] ?? id);
  return {
    id: c.id,
    a: c.aCard,
    b: c.bCard,
    // Which line(s) the card belongs to: the deck is not one deck. Without it a
    // mixed list reads as noise ("Seoul shares open 5.72 pct lower" is not a
    // Dutch card gone wrong, it is the English line).
    lines: inLines.length ? inLines : undefined,
    state: c.srs ? (STATE[c.srs.state] ?? `state ${c.srs.state}`) : "Unstudied",
    due: c.srs ? new Date(c.srs.due).toISOString() : undefined,
    reps: c.srs?.reps,
    lapses: c.srs?.lapses,
    stability: c.srs ? +c.srs.stability.toFixed(2) : undefined,
    difficulty: c.srs ? +c.srs.difficulty.toFixed(2) : undefined,
  };
}

export interface HistoryEvent {
  at: number;
  when: string;
  card: string;
  cardId: string;
  kind: string;
  grade?: string;
  line?: string;
  typed?: string;
  dueInDays?: number;
}

/** Kinds written by the retired manual queue (`lib/queue.ts`). The rows stay —
 *  that scheduler is a revert away — but they outnumber the study history 12:1
 *  and say nothing about how a card is doing, so the read-only views drop them.
 *  Look in `cards.log` itself if the old placements are ever wanted. */
const RETIRED = new Set(["place", "top", "move"]);

/**
 * Every card's log flattened into one stream, newest first, with line ids
 * resolved to names and grades to words. The logs are keyed by event id and
 * carry their own timestamps, so order across cards is recovered here rather
 * than stored anywhere.
 */
export function events(
  cards: DeckCard[],
  lines: Record<string, string> = {},
): HistoryEvent[] {
  const out: HistoryEvent[] = [];
  for (const c of cards) {
    for (const e of Object.values(c.log ?? {})) {
      if (RETIRED.has(e.kind)) continue;
      out.push({
        at: e.at,
        when: new Date(e.at).toISOString(),
        card: c.aCard,
        cardId: c.id,
        kind: e.kind,
        grade: e.kind === "rate" ? RATING[e.amount] : undefined,
        line: lines[e.lineId],
        typed: typeof e.typed === "string" && e.typed ? e.typed : undefined,
        dueInDays:
          typeof e.dueIn === "number" ? +e.dueIn.toFixed(1) : undefined,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Counts per calendar day, grades broken out — `rate` alone says nothing about
 *  how a day went. Dates are the local ISO day, which is what "yesterday" means
 *  to the person who studied. */
export function byDay(
  evs: HistoryEvent[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const e of evs) {
    const d = new Date(e.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const bucket = (out[key] ??= {});
    const k = e.kind === "rate" ? `rate:${e.grade}` : e.kind;
    bucket[k] = (bucket[k] ?? 0) + 1;
  }
  return out;
}

/** Deck-wide counts, so a caller doesn't need five queries for five numbers.
 *  `due` is due now, `dueToday` includes what falls due before midnight. */
export function tally(cards: DeckCard[], now = Date.now()) {
  const endOfDay = new Date(now).setHours(23, 59, 59, 999);
  const out: Record<string, number> = { due: 0, dueToday: 0 };
  for (const c of cards) {
    const state = c.srs
      ? (STATE[c.srs.state] ?? `state ${c.srs.state}`).toLowerCase()
      : "unstudied";
    out[state] = (out[state] ?? 0) + 1;
    if (c.srs && c.srs.due <= now) out.due++;
    if (c.srs && c.srs.due <= endOfDay) out.dueToday++;
  }
  return out;
}
