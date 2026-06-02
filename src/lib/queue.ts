import { id } from "@instantdb/react";
import {
  generateKeyBetween,
  generateNKeysBetween,
} from "fractional-indexing";
import { db } from "../db";

// The line is one ordered list. Each queueEntry has a fractional `rank` string;
// sorting ranks ascending gives top -> bottom of the line. Lexicographic string
// order matches InstantDB's string ordering, so we never renumber on insert.

// Buttons shown after revealing a card: drop it to the N-th place from the top.
// Easy to tweak — just edit this array.
export const DEPTH_BUTTONS = [5, 10, 50, 100, 500, 1000];

// Nudge amounts on the Line view (used as +N / -N).
export const MOVE_STEPS = [1, 5, 25, 100];

export { generateKeyBetween };

type RankRow = { id: string; rank: string };

/**
 * Place the current top card at the `depth`-th position from the top (1-indexed)
 * and log a "place" event. The shown card is always the one with the smallest
 * rank, so we only need the top `depth + 1` entries to find its new neighbours.
 */
export async function placeAtDepth(
  entryId: string,
  cardId: string,
  depth: number,
): Promise<void> {
  const res = await db.queryOnce({
    queueEntries: { $: { order: { rank: "asc" }, limit: depth + 1 } },
  });
  const top = (res.data?.queueEntries ?? []) as RankRow[];

  // After the top card is removed, the entries that will occupy positions
  // depth-1 and depth are top[depth-1] and top[depth] (top[0] is this card).
  const before = top[depth - 1];
  const after = top[depth];

  let newRank: string;
  if (!before) {
    // Line is shorter than `depth`: drop to the very bottom.
    const last = top[top.length - 1];
    newRank = generateKeyBetween(last ? last.rank : null, null);
  } else {
    newRank = generateKeyBetween(before.rank, after ? after.rank : null);
  }

  await db.transact([
    db.tx.queueEntries[entryId].update({ rank: newRank }),
    db.tx.cardEvents[id()]
      .update({ at: Date.now(), kind: "place", amount: depth })
      .link({ card: cardId }),
  ]);
}

/**
 * Apply a precomputed rank to an entry (used by the Line view, which already has
 * the surrounding entries in memory) and log a signed "move" event.
 */
export async function moveToRank(
  entryId: string,
  cardId: string,
  newRank: string,
  steps: number,
): Promise<void> {
  await db.transact([
    db.tx.queueEntries[entryId].update({ rank: newRank }),
    db.tx.cardEvents[id()]
      .update({ at: Date.now(), kind: "move", amount: steps })
      .link({ card: cardId }),
  ]);
}

/** Add a card to the very top of the line (used when a new card is created). */
export async function enqueueTop(cardId: string): Promise<void> {
  const res = await db.queryOnce({
    queueEntries: { $: { order: { rank: "asc" }, limit: 1 } },
  });
  const first = (res.data?.queueEntries ?? [])[0] as RankRow | undefined;
  const newRank = generateKeyBetween(null, first ? first.rank : null);
  await db.transact(
    db.tx.queueEntries[id()].update({ rank: newRank }).link({ card: cardId }),
  );
}

/** Append several cards to the bottom of the line (used to backfill existing cards). */
export async function enqueueBottom(cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return;
  const res = await db.queryOnce({
    queueEntries: { $: { order: { rank: "desc" }, limit: 1 } },
  });
  const last = (res.data?.queueEntries ?? [])[0] as RankRow | undefined;
  const ranks = generateNKeysBetween(
    last ? last.rank : null,
    null,
    cardIds.length,
  );
  await db.transact(
    cardIds.map((cid, i) =>
      db.tx.queueEntries[id()].update({ rank: ranks[i] }).link({ card: cid }),
    ),
  );
}
