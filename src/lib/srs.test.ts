import { describe, expect, it } from "vitest";
import {
  dueCards,
  dueForecast,
  newPool,
  dueSoon,
  formatGap,
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
  it("counts what comes back within a day, excluding what is due already", () => {
    expect(dueSoon(all, "L", now)).toBe(1);
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
