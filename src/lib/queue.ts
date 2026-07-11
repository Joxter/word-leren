import { id } from "@instantdb/react";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { db } from "../db";

// A learning line is an ordered list of cards. Each card stores one fractional
// `rank` string per line it belongs to, under `card.queues[lineId]`. Sorting
// those ranks ascending gives top -> bottom of that line. Because ranks are
// fractional, reordering is a single write and we never renumber on insert.
//
// Membership and ranks live on the cards (as JSON), not in a separate entity,
// so there is no "filter by line + order by rank" query — callers load the
// cards they already have and sort in memory with the helpers below.

export const DEPTH_BUTTONS = [8, 20, 50, 100, 200, 300, 500];

// Nudge amounts on the Line view (used as +N / -N).
export const MOVE_STEPS = [1, 5, 25, 100];

export { generateKeyBetween };

/**
 * Jitter a target depth by up to ±4%, staying at least 1. Rounds to a whole
 * position, so shallow depths (where 4% < half a slot) are left unchanged.
 */
function disperseDepth(depth: number): number {
  const jitter = Math.round(depth * 0.04 * (Math.random() * 2 - 1));
  return Math.max(1, depth + jitter);
}

/**
 * Like `generateKeyBetween`, but tolerant of degenerate neighbours: if `a` and
 * `b` are equal or out of order (which shouldn't happen, but can if duplicate
 * ranks ever sneak in), it falls back to a key just after `a` instead of
 * throwing. This keeps Learn/Line working and lets the order self-heal over
 * time. Run `scripts/fix-ranks.mjs` to fully clean up duplicates.
 */
export function safeKeyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    return generateKeyBetween(a, null);
  }
  return generateKeyBetween(a, b);
}

export type CardQueues = { [lineId: string]: { rank: string } };

/** One entry in a card's `log` history. */
export type LogEntry = {
  at: number;
  lineId: string;
  kind: string;
  amount: number;
  /** What the user typed as the answer before revealing ("" if they didn't). */
  typed?: string;
};

export type CardLog = { [eventId: string]: LogEntry };

export interface ReviewStats {
  /** How many times the card was reviewed (a Depth button was pressed). */
  seen: number;
  /** The last review's amounts, most recent first (up to `limit`). */
  recent: number[];
}

/**
 * Summarise a card's review history from its `log`. A "review" is a `place`
 * event from pressing a Depth button on the Learn page; the two synthetic adds
 * (`enqueueBottom` logs amount 0, `enqueueTop` logs amount 1) and `move` events
 * are not reviews, so we only count `place` events with amount > 1.
 */
export function reviewStats(log?: CardLog, limit = 2): ReviewStats {
  const reviews = Object.values(log ?? {}).filter(
    (e) => e.kind === "place" && e.amount > 1,
  );
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
 * A "review" is the same `place`-with-amount>1 event `reviewStats` counts, and
 * counts span all lines — this is an overall study-activity metric.
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
      if (e.kind !== "place" || e.amount <= 1) continue;
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

/** Minimal shape the queue helpers need from a card. */
export interface QueuedCard {
  id: string;
  queues?: CardQueues;
}

/** The rank of a card within a line, or undefined if it isn't in that line. */
export function rankInLine(
  card: QueuedCard,
  lineId: string,
): string | undefined {
  return card.queues?.[lineId]?.rank;
}

/**
 * The cards that belong to `lineId`, sorted top -> bottom by their rank in that
 * line. Non-members are dropped.
 */
export function sortLine<T extends QueuedCard>(
  cards: T[],
  lineId: string,
): T[] {
  return cards
    .filter((c) => rankInLine(c, lineId) !== undefined)
    .sort((a, b) => {
      const ra = rankInLine(a, lineId)!;
      const rb = rankInLine(b, lineId)!;
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
}

// Write a card's new rank in a line and append a history event, in one tx.
// `merge` deep-merges into the JSON attributes, so other lines' ranks and other
// log entries are left untouched.
function writeRank(
  cardId: string,
  lineId: string,
  rank: string,
  kind: string,
  amount: number,
  typed = "",
) {
  const eventId = id();
  return db.transact(
    db.tx.cards[cardId].merge({
      queues: { [lineId]: { rank } },
      log: { [eventId]: { at: Date.now(), lineId, kind, amount, typed } },
    }),
  );
}

/**
 * Place the top card of a line at the `depth`-th position from the top
 * (1-indexed) and log a "place" event. `members` is the line's cards already
 * sorted top -> bottom (members[0] is the card being placed).
 *
 * When `disperse` is true, the target depth is jittered by up to ±2% so that
 * cards repeatedly dropped to the same depth don't pile up at the exact same
 * spot. The jitter is negligible for shallow depths and grows with depth.
 */
export async function placeAtDepth(
  members: QueuedCard[],
  lineId: string,
  depth: number,
  disperse = false,
  typed = "",
): Promise<void> {
  const current = members[0];
  if (!current) return;

  const target = disperse ? disperseDepth(depth) : depth;

  // members[0] is this card. To land at the `target`-th position after it's
  // removed, we slot it between the cards currently at index target-1 and
  // target.
  const before = members[target - 1];
  const after = members[target];

  let newRank: string;
  if (!before) {
    // Line is shorter than `depth`: drop to the very bottom.
    const last = members[members.length - 1];
    newRank = generateKeyBetween(rankInLine(last, lineId) ?? null, null);
  } else {
    newRank = safeKeyBetween(
      rankInLine(before, lineId)!,
      after ? rankInLine(after, lineId)! : null,
    );
  }

  await writeRank(current.id, lineId, newRank, "place", depth, typed);
}

/**
 * Apply a precomputed rank to a card in a line (used by the Line view, which
 * already has the surrounding cards in memory) and log a signed "move" event.
 */
export async function moveToRank(
  cardId: string,
  lineId: string,
  newRank: string,
  steps: number,
): Promise<void> {
  await writeRank(cardId, lineId, newRank, "move", steps);
}

/** Add a card to the very top of a line (used when a new card is created). */
export async function enqueueTop(
  lineId: string,
  cardId: string,
): Promise<void> {
  const res = await db.queryOnce({ cards: {} });
  const cards = (res.data?.cards ?? []) as QueuedCard[];
  const top = sortLine(cards, lineId)[0];
  const newRank = generateKeyBetween(
    null,
    top ? rankInLine(top, lineId)! : null,
  );
  await writeRank(cardId, lineId, newRank, "place", 1);
}

/**
 * Append several cards to the bottom of a line. `bottomRank` is the current
 * last rank in the line (or null if the line is empty) — the caller usually has
 * the sorted line in memory and can pass it directly.
 */
export async function enqueueBottom(
  lineId: string,
  cardIds: string[],
  bottomRank: string | null,
): Promise<void> {
  if (cardIds.length === 0) return;
  const ranks = generateNKeysBetween(bottomRank, null, cardIds.length);
  const eventId = () => id();
  await db.transact(
    cardIds.map((cid, i) => {
      const evId = eventId();
      return db.tx.cards[cid].merge({
        queues: { [lineId]: { rank: ranks[i] } },
        log: { [evId]: { at: Date.now(), lineId, kind: "place", amount: 0 } },
      });
    }),
  );
}

/** Remove a card from a line (keeps the card, drops its membership + rank). */
export async function removeFromLine(
  lineId: string,
  cardId: string,
): Promise<void> {
  // merge treats a null value as "delete this key".
  await db.transact(db.tx.cards[cardId].merge({ queues: { [lineId]: null } }));
}
