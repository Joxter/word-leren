import { useEffect, useMemo, useState } from "react";
import { id } from "@instantdb/react";
import { db } from "../db";
import { mine, ownerId } from "./session";
import {
  linePositions,
  sortLine,
  type LinePosition,
  type QueuedCard,
} from "./queue";

// A "line" is a named learning queue. Membership + per-line rank live on the
// cards (see queue.ts); this module just manages the line records themselves
// plus the currently-selected line in the UI.

export interface Line {
  id: string;
  name: string;
  createdAt: number;
}

/** All lines, oldest first. The oldest line is treated as the default. */
export function useLines(): { lines: Line[]; isLoading: boolean } {
  const { data, isLoading } = db.useQuery({
    lines: { $: { where: mine(), order: { createdAt: "asc" } } },
  });
  return { lines: (data?.lines ?? []) as Line[], isLoading };
}

export async function createLine(name: string): Promise<string> {
  const lineId = id();
  await db.transact(
    db.tx.lines[lineId]
      .update({ name, createdAt: Date.now() })
      .link({ owner: ownerId() }),
  );
  return lineId;
}

export async function renameLine(lineId: string, name: string): Promise<void> {
  await db.transact(db.tx.lines[lineId].update({ name }));
}

/**
 * Delete a line and strip its membership from every card that was in it (cards
 * themselves are kept — a line is just one way to organise them).
 */
export async function deleteLine(lineId: string): Promise<void> {
  const res = await db.queryOnce({ cards: { $: { where: mine() } } });
  const members = sortLine((res.data?.cards ?? []) as QueuedCard[], lineId);
  await db.transact([
    ...members.map((c) =>
      db.tx.cards[c.id].merge({ queues: { [lineId]: null } }),
    ),
    db.tx.lines[lineId].delete(),
  ]);
}

/**
 * The id of the default line (the oldest), creating a "default" line if none
 * exists yet. Used by the new-card flows, which have no active-line context.
 */
export async function getDefaultLineId(): Promise<string> {
  const res = await db.queryOnce({
    lines: { $: { where: mine(), order: { createdAt: "asc" }, limit: 1 } },
  });
  const first = (res.data?.lines ?? [])[0] as Line | undefined;
  if (first) return first.id;
  return createLine("default");
}

const ACTIVE_LINE_KEY = "word-leren:activeLine";

/**
 * The currently-selected line for the Learn/Line pages, persisted in
 * localStorage. Falls back to the oldest line when nothing valid is stored.
 */
export function useActiveLine(
  lines: Line[],
): [string | null, (lineId: string) => void] {
  const [stored, setStored] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_LINE_KEY),
  );

  const valid = stored && lines.some((l) => l.id === stored);
  const active = valid ? stored : (lines[0]?.id ?? null);

  // Persist the resolved fallback so the selector and storage stay in sync.
  useEffect(() => {
    if (active && active !== stored) {
      localStorage.setItem(ACTIVE_LINE_KEY, active);
      setStored(active);
    }
  }, [active, stored]);

  function setActive(lineId: string) {
    localStorage.setItem(ACTIVE_LINE_KEY, lineId);
    setStored(lineId);
  }

  return [active, setActive];
}

/**
 * `linePositions` over every line there is — what the "#12" badges next to a
 * card are made of. The caller brings the cards it is already showing; only
 * the lines are fetched here.
 */
export function useLinePositions(
  cards: QueuedCard[],
): Map<string, LinePosition[]> {
  const { lines } = useLines();
  return useMemo(() => linePositions(cards, lines), [cards, lines]);
}
