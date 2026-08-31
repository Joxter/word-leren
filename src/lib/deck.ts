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
}

export interface Brief {
  id: string;
  a: string;
  b: string;
  note?: string;
  state: string;
  due?: string;
  reps?: number;
  lapses?: number;
  stability?: number;
  difficulty?: number;
}

/** What a list returns: enough to decide on a card, not the whole row. Notes
 *  can run to a screenful of dictionary markup, so they stay out of lists. */
export function brief(c: DeckCard): Brief {
  return {
    id: c.id,
    a: c.aCard,
    b: c.bCard,
    note: c.note || undefined,
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
