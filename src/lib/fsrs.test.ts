import { describe, expect, it } from "vitest";
import { retrievability, sortByR } from "./fsrs";

const DAY = 864e5;
const card = (stability: number, daysAgo: number, lineId = "L") => ({
  id: `s${stability}-d${daysAgo}`,
  stability,
  difficulty: 5,
  lastReviewedAt: Date.now() - daysAgo * DAY,
  queues: { [lineId]: { rank: "a" } },
});

describe("retrievability", () => {
  it("decays with time and grows with stability", () => {
    expect(retrievability(card(5, 0))).toBeCloseTo(1, 5);
    expect(retrievability(card(5, 2))).toBeGreaterThan(
      retrievability(card(5, 10)),
    );
    expect(retrievability(card(50, 10))).toBeGreaterThan(
      retrievability(card(5, 10)),
    );
    // By FSRS's definition, R at t = S is the requested retention, 90%.
    expect(retrievability(card(7, 7))).toBeCloseTo(0.9, 2);
  });
});

describe("sortByR", () => {
  it("orders most-forgotten first, dropping unseeded and non-members", () => {
    const overdue = card(2, 10);
    const fresh = card(2, 0);
    const unseeded = { id: "new", queues: { L: { rank: "b" } } };
    const otherLine = card(2, 10, "M");
    const queue = sortByR([fresh, unseeded, otherLine, overdue], "L");
    expect(queue.map((c) => c.id)).toEqual([overdue.id, fresh.id]);
  });
});
