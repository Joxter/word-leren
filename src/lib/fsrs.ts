import { id } from "@instantdb/react";
import { fsrs, Rating } from "ts-fsrs";
import { db } from "../db";

// FSRS scheduling over the same lines: the queue is not stored anywhere, it is
// the line's seeded cards sorted by retrievability, lowest (= most likely
// forgotten) first. See fsrs-single-queue-spec.md for the why.

export { Rating };

export const RATINGS = [
  { rating: Rating.Again, label: "Again" },
  { rating: Rating.Hard, label: "Hard" },
  { rating: Rating.Good, label: "Good" },
  { rating: Rating.Easy, label: "Easy" },
] as const;

// enable_short_term makes same-day re-reviews update S sensibly (needed once
// the new-card buffer lands); fuzz is off because there are no days to spread
// cards across — R already spreads them.
const scheduler = fsrs({ enable_fuzz: false, enable_short_term: true });

/** Minimal shape the FSRS helpers need from a card. */
export interface FsrsCard {
  id: string;
  stability?: number;
  difficulty?: number;
  lastReviewedAt?: number;
  queues?: { [lineId: string]: { rank: string } };
}

export function elapsedDays(card: FsrsCard, now = Date.now()): number {
  return Math.max(0, (now - (card.lastReviewedAt ?? now)) / 864e5);
}

/** R ∈ (0, 1]: how likely the card still comes to mind right now. */
export function retrievability(card: FsrsCard, now = Date.now()): number {
  return scheduler.forgetting_curve(elapsedDays(card, now), card.stability!);
}

/**
 * The FSRS queue of a line: its seeded cards (stability set), most-forgotten
 * first. Unseeded cards are the "new" pool and stay out until introduced.
 */
export function sortByR<T extends FsrsCard>(
  cards: T[],
  lineId: string,
  now = Date.now(),
): T[] {
  return cards
    .filter(
      (c) => c.queues?.[lineId]?.rank !== undefined && c.stability != null,
    )
    .sort((a, b) => retrievability(a, now) - retrievability(b, now));
}

/**
 * Apply a rating: advance the card's memory state and append a "rate" event
 * (amount = the rating) recording the transition, so the log alone can feed a
 * parameter optimizer later.
 */
export async function rateCard(
  card: FsrsCard,
  lineId: string,
  rating: Rating,
  typed = "",
  linkId = "",
  source: "session" | "field" | "manual" = "session",
): Promise<void> {
  const now = Date.now();
  const before =
    card.stability != null && card.difficulty != null
      ? { stability: card.stability, difficulty: card.difficulty }
      : null;
  const elapsed = before ? elapsedDays(card, now) : 0;
  const next = scheduler.next_state(before, elapsed, rating);
  await db.transact(
    db.tx.cards[card.id].merge({
      stability: next.stability,
      difficulty: next.difficulty,
      lastReviewedAt: now,
      log: {
        [id()]: {
          at: now,
          lineId,
          kind: "rate",
          amount: rating,
          typed,
          linkId,
          elapsedDays: elapsed,
          sBefore: before?.stability ?? null,
          dBefore: before?.difficulty ?? null,
          sAfter: next.stability,
          dAfter: next.difficulty,
          source,
        },
      },
    }),
  );
}
