import { id } from "@instantdb/react";
// Type-only, so the srs.ts <-> log.ts cycle stays a compile-time one.
import type { SrsState } from "./srs";

// A card's history: `cards.log` is one JSON blob of events keyed by event id,
// so writers `merge` new entries in without clobbering each other. Nothing is
// ever removed from it — events from schedulers that are gone (the manual
// queue's `place`/`top`/`move`, the `known` triage) stay as they were written.

/** One entry in a card's `log` history. */
export type LogEntry = {
  at: number;
  lineId: string;
  kind: string;
  amount: number;
  /** What the user typed as the answer before revealing ("" if they didn't). */
  typed?: string;
  /**
   * The `exampleLinks` id this review was answered through, when the card was
   * shown as a cloze ("" otherwise). Drives which example comes up next — see
   * `pickClozeLink` in lib/examples.ts.
   */
  linkId?: string;
  // FSRS review (kind "rate"): amount holds the rating 1-4, and the state
  // transition is recorded so the log alone can feed a parameter optimizer.
  elapsedDays?: number;
  sBefore?: number | null;
  dBefore?: number | null;
  sAfter?: number;
  dAfter?: number;
  /** Days until the card was scheduled next, as this answer set it. */
  dueIn?: number;
  /** "session" = from the queue, "field" = met in the wild, "manual" = state edited by hand. */
  source?: "session" | "field" | "manual";
  /** Card text edit (kind "edit"): which of aCard/bCard/note changed... */
  fields?: string[];
  /** ...and what the short ones used to say. The old note is not kept: it holds
   *  a whole dictionary entry, and every page loads every card's log. */
  prev?: { aCard?: string; bCard?: string };
  /** Sent back to the pool (kind "backlog"): the FSRS state the card was
   *  carrying when its schedule was dropped. Nothing reads it — the way back
   *  through Backlog reseeds from scratch — but a grade history whose
   *  schedule vanished without trace is a history that can't be replayed. */
  srs?: SrsState | null;
};

export type CardLog = { [eventId: string]: LogEntry };

/**
 * One log event, keyed by its own id so several writers can `merge` into the
 * same `log` without clobbering each other. `lineId` is "" for events that
 * happen outside any line (an edit, a delete).
 */
export function logEntry(
  lineId: string,
  kind: string,
  amount: number,
  extra: Record<string, unknown> = {},
): CardLog {
  return { [id()]: { at: Date.now(), lineId, kind, amount, ...extra } };
}

export interface ReviewStats {
  /** How many times the card was answered. */
  seen: number;
  /** The last review's amounts, most recent first (up to `limit`). */
  recent: number[];
}

/**
 * Whether a log event was an answer. FSRS writes `rate` (amount is the 1-4
 * rating). Older logs also hold `place` events from the retired manual queue:
 * one with amount > 1 was a depth button pressed on Learn, which was a review
 * too; amount 0 or 1 was the card being added to a line, which was not.
 */
export function isReview(e: LogEntry): boolean {
  return (e.kind === "place" && e.amount > 1) || e.kind === "rate";
}

export function reviewStats(log?: CardLog, limit = 2): ReviewStats {
  const reviews = Object.values(log ?? {}).filter(isReview);
  reviews.sort((a, b) => b.at - a.at);
  return {
    seen: reviews.length,
    recent: reviews.slice(0, limit).map((e) => e.amount),
  };
}

export interface DayStat {
  /** Local midnight of the day. */
  date: Date;
  /** Distinct cards reviewed that day. */
  unique: number;
  /** Total reviews that day, counting repeats of the same card. */
  total: number;
}

/**
 * Per-day review counts for the last `days` days, oldest first and today last.
 * A "review" is whatever `isReview` accepts, and counts span all lines — this is an overall study-activity metric.
 */
export function dailyReviewStats(
  cards: { id: string; log?: CardLog }[],
  days = 14,
): DayStat[] {
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const totals = new Map<string, number>();
  const uniques = new Map<string, Set<string>>();
  for (const c of cards) {
    for (const e of Object.values(c.log ?? {})) {
      if (!isReview(e)) continue;
      const k = dayKey(new Date(e.at));
      totals.set(k, (totals.get(k) ?? 0) + 1);
      let set = uniques.get(k);
      if (!set) uniques.set(k, (set = new Set()));
      set.add(c.id);
    }
  }

  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: DayStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const k = dayKey(d);
    out.push({
      date: d,
      unique: uniques.get(k)?.size ?? 0,
      total: totals.get(k) ?? 0,
    });
  }
  return out;
}
