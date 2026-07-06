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

export const DEPTH_BUTTONS = [8, 20, 50, 100, 500];

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
) {
  const eventId = id();
  return db.transact(
    db.tx.cards[cardId].merge({
      queues: { [lineId]: { rank } },
      log: { [eventId]: { at: Date.now(), lineId, kind, amount } },
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

  await writeRank(current.id, lineId, newRank, "place", depth);
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
