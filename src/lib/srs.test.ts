import { describe, expect, it } from "vitest";
import {
  dueCards,
  dueForecast,
  newPool,
  dueSoon,
  formatGap,
  gradeHistory,
  previewIntervals,
  Rating,
  type SrsState,
} from "./srs";

const HOUR = 36e5;
const state = (due: number): SrsState => ({
  due,
  stability: 5,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 5,
  learning_steps: 0,
  reps: 1,
  lapses: 0,
  state: 2,
  last_review: due - 5 * 864e5,
});

const now = Date.now();
const overdue = {
  id: "overdue",
  srs: state(now - 3 * 864e5),
  queues: { L: { rank: "a" } },
};
const dueNow = {
  id: "dueNow",
  srs: state(now - HOUR),
  queues: { L: { rank: "b" } },
};
const later = {
  id: "later",
  srs: state(now + 5 * HOUR),
  queues: { L: { rank: "c" } },
};
const nextWeek = {
  id: "nextWeek",
  srs: state(now + 7 * 864e5),
  queues: { L: { rank: "d" } },
};
const fresh = { id: "fresh", queues: { L: { rank: "e" } } };
const otherLine = {
  id: "other",
  srs: state(now - 864e5),
  queues: { M: { rank: "a" } },
};

const all = [later, overdue, fresh, nextWeek, dueNow, otherLine];

describe("dueCards", () => {
  it("takes only this line's due cards, most overdue first", () => {
    expect(dueCards(all, "L", now).map((c) => c.id)).toEqual([
      "overdue",
      "dueNow",
    ]);
  });

  it("leaves out cards that were never taken into study", () => {
    expect(dueCards(all, "L", now).some((c) => c.id === "fresh")).toBe(false);
  });
});

describe("newPool", () => {
  it("is exactly the untouched cards of the line", () => {
    expect(newPool(all, "L").map((c) => c.id)).toEqual(["fresh"]);
  });
});

describe("dueSoon", () => {
  // A fixed local noon: "today" has to be a calendar day, so a fixture built
  // off the wall clock would count differently depending on the hour it ran.
  const noon = new Date(2026, 0, 15, 12, 0, 0).getTime();
  const at = (t: number, id: string) => ({
    id,
    srs: state(t),
    queues: { L: { rank: "a" } },
  });

  it("counts what still comes back today, excluding what is due already", () => {
    const cards = [
      at(noon - HOUR, "past"),
      at(noon + 5 * HOUR, "evening"),
      at(noon + 14 * HOUR, "tomorrow"),
    ];
    expect(dueSoon(cards, "L", noon)).toBe(1);
  });
});

describe("gradeHistory", () => {
  const log = {
    a: { at: 300, lineId: "L", kind: "rate", amount: 3, dueIn: 15 },
    b: { at: 100, lineId: "L", kind: "rate", amount: 1 },
    c: { at: 200, lineId: "L", kind: "place", amount: 250 },
    d: { at: 400, lineId: "", kind: "edit", amount: 1 },
    e: { at: 50, lineId: "L", kind: "known", amount: 4, dueIn: 7 },
  };

  it("keeps answers — graded and marked known alike — oldest first", () => {
    expect(gradeHistory(log)).toEqual([
      { at: 50, rating: 4, dueIn: 7 },
      { at: 100, rating: 1, dueIn: undefined },
      { at: 300, rating: 3, dueIn: 15 },
    ]);
  });

  it("keeps the most recent ones when there are more than the limit", () => {
    expect(gradeHistory(log, 1)).toEqual([{ at: 300, rating: 3, dueIn: 15 }]);
  });

  it("is empty for a card that has never been answered", () => {
    expect(gradeHistory(undefined)).toEqual([]);
  });
});

describe("formatGap", () => {
  it("scales the unit to the size of the gap", () => {
    expect(formatGap(10 * 6e4)).toBe("10 мин");
    expect(formatGap(3 * HOUR)).toBe("3 ч");
    expect(formatGap(8 * 864e5)).toBe("8 дн");
    expect(formatGap(60 * 864e5)).toBe("2.0 мес");
    expect(formatGap(400 * 864e5)).toBe("1.1 г");
  });
});

describe("previewIntervals", () => {
  // A mature card: 11 days of stability, easily recalled so far.
  const mature = {
    id: "mature",
    srs: {
      ...state(now),
      stability: 10.97,
      difficulty: 2.1,
      scheduled_days: 12,
      reps: 3,
    },
  };

  it("spells out what a rating costs past its learning step", () => {
    const p = previewIntervals(mature, now);
    // Again only schedules a 10-minute relearning step, so on its own it
    // reads cheaper than Hard. The arrow is what makes the two comparable.
    expect(p[Rating.Again]).toMatch(/^10 мин → /);
    expect(p[Rating.Again]).not.toBe(p[Rating.Hard]);
    // A rating that lands straight in review is its own whole answer.
    for (const r of [Rating.Hard, Rating.Good, Rating.Easy]) {
      expect(p[r]).not.toContain("→");
    }
  });

  // The buttons are compared across units — "1 дн" against "1.7 мес" — so the
  // unit has to come back out of the string along with the number.
  const UNIT: Record<string, number> = {
    мин: 1 / 1440,
    ч: 1 / 24,
    дн: 1,
    мес: 30.4,
    г: 365,
  };
  const days = (gap: string) => {
    const last = gap.split("\u2192").pop()!.trim();
    const [, n, unit] = last.match(/([\d.]+) (\S+)/)!;
    return Number(n) * UNIT[unit];
  };

  it("costs Again more than a pass, once the step is paid", () => {
    const older = {
      ...mature,
      srs: { ...mature.srs, stability: 60, elapsed_days: 12 },
    };
    for (const card of [mature, older]) {
      const p = previewIntervals(card, now);
      expect(days(p[Rating.Again])).toBeLessThan(days(p[Rating.Good]));
    }
  });

  it("prints a gap that reads back as a number of days", () => {
    const p = previewIntervals(mature, now);
    for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
      expect(days(p[r])).toBeGreaterThan(0);
    }
  });
});

describe("dueForecast", () => {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const at = (days: number) => +noon + days * 864e5;

  it("buckets by calendar day and folds overdue into today", () => {
    const days = dueForecast(
      [
        { id: "a", srs: state(at(-9)) },
        { id: "b", srs: state(at(0)) },
        { id: "c", srs: state(at(2)) },
        { id: "d", srs: state(at(2)) },
        { id: "beyond", srs: state(at(40)) },
        { id: "new" },
      ],
      7,
      +noon,
    );
    expect(days.map((d) => d.cards.length)).toEqual([2, 0, 2, 0, 0, 0, 0]);
    expect(days[0].date.getDate()).toBe(noon.getDate());
  });
});
