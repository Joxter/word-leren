import { useEffect, useMemo, useState } from "react";
import { id } from "@instantdb/react";
import { db } from "../db";
import { mine, ownerId } from "./session";

// A "line" is a named deck: its own Learn session, its own Backlog. Which lines
// a card is in lives on the card itself, as the keys of `cards.queues`; the
// line rows only carry a name.
//
// Each key holds `{ rank }`, a leftover of the manual queue that ordered a
// line by hand before FSRS. Nothing reads the rank any more — the order is the
// schedule's — but the shape is kept so old and new rows look alike, and new
// memberships write an empty one.

export type CardQueues = { [lineId: string]: { rank: string } };

/** Minimal shape the membership helpers need from a card. */
export interface LinedCard {
  id: string;
  queues?: CardQueues;
}

export function inLine(card: LinedCard, lineId: string): boolean {
  return !!card.queues?.[lineId];
}

/** The cards that belong to `lineId`, in the order they were given. */
export function lineMembers<T extends LinedCard>(
  cards: T[],
  lineId: string,
): T[] {
  return cards.filter((c) => inLine(c, lineId));
}

/** Put a card in a line. Nothing is logged: joining a line is not history. */
export async function addToLine(lineId: string, cardId: string): Promise<void> {
  await db.transact(
    db.tx.cards[cardId].merge({ queues: { [lineId]: { rank: "" } } }),
  );
}

/** Take a card out of a line (keeps the card and its schedule). */
export async function removeFromLine(
  lineId: string,
  cardId: string,
): Promise<void> {
  // merge treats a null value as "delete this key".
  await db.transact(db.tx.cards[cardId].merge({ queues: { [lineId]: null } }));
}

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
  const members = lineMembers((res.data?.cards ?? []) as LinedCard[], lineId);
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
 * The names of the lines each card is in, keyed by card id — what the line
 * badges next to a card print. Cards in no line are absent. With a single
 * line every card would print the same word, so members map to no names at
 * all and only the cards outside it stand out. The caller brings the cards
 * it is already showing; only the lines are fetched here.
 */
export function useCardLines(cards: LinedCard[]): Map<string, string[]> {
  const { lines } = useLines();
  return useMemo(() => {
    const out = cardLines(cards, lines);
    if (lines.length < 2) for (const k of out.keys()) out.set(k, []);
    return out;
  }, [cards, lines]);
}

export function cardLines(
  cards: LinedCard[],
  lines: { id: string; name: string }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const card of cards) {
    const names = lines.filter((l) => inLine(card, l.id)).map((l) => l.name);
    if (names.length) out.set(card.id, names);
  }
  return out;
}
