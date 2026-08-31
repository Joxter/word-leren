import { describe, it, expect } from "vitest";
import { brief, events, byDay, type DeckCard } from "./deck";

const card = (over: Partial<DeckCard> = {}): DeckCard => ({
  id: "c1",
  aCard: "de fiets",
  bCard: "bicycle",
  ...over,
});

describe("brief", () => {
  it("calls a card with no srs unstudied rather than New", () => {
    // State 0 *is* "New" in ts-fsrs, but a card that has never been taken into
    // study has no srs at all — conflating the two hides the Deck page's pool.
    expect(brief(card()).state).toBe("Unstudied");
    expect(brief(card()).due).toBeUndefined();
  });

  it("names the state and rounds the model's numbers", () => {
    const b = brief(
      card({
        srs: {
          due: 0,
          stability: 8.29999,
          difficulty: 1.23456,
          reps: 1,
          lapses: 0,
          state: 2,
        },
      }),
    );
    expect(b.state).toBe("Review");
    expect(b.due).toBe("1970-01-01T00:00:00.000Z");
    expect(b.stability).toBe(8.3);
    expect(b.difficulty).toBe(1.23);
  });
});

describe("events", () => {
  const cards = [
    card({
      log: {
        e1: { at: 200, lineId: "L", kind: "rate", amount: 1, typed: "fiets" },
        e2: { at: 100, lineId: "L", kind: "introduce", amount: 0 },
      },
    }),
    card({
      id: "c2",
      aCard: "het huis",
      log: {
        e3: { at: 300, lineId: "L", kind: "rate", amount: 4, dueIn: 7.77 },
      },
    }),
  ];

  it("interleaves cards newest first and resolves ids to names", () => {
    const out = events(cards, { L: "default" });
    expect(out.map((e) => e.at)).toEqual([300, 200, 100]);
    expect(out[0].card).toBe("het huis");
    expect(out[0].grade).toBe("Easy");
    expect(out[0].dueInDays).toBe(7.8);
    expect(out[1].grade).toBe("Again");
    expect(out[1].typed).toBe("fiets");
    expect(out[0].line).toBe("default");
  });

  it("leaves non-rate events without a grade", () => {
    // `introduce` carries amount 0, which would read as the Manual rating.
    const intro = events(cards).find((e) => e.kind === "introduce");
    expect(intro?.grade).toBeUndefined();
  });

  it("survives cards with no log", () => {
    expect(events([card()])).toEqual([]);
  });
});

describe("byDay", () => {
  it("breaks rates out by grade and keeps other kinds whole", () => {
    const at = new Date(2026, 7, 31, 12).getTime();
    const out = byDay(
      events([
        card({
          log: {
            a: { at, lineId: "L", kind: "rate", amount: 3 },
            b: { at: at + 1, lineId: "L", kind: "rate", amount: 3 },
            c: { at: at + 2, lineId: "L", kind: "introduce", amount: 0 },
          },
        }),
      ]),
    );
    expect(out["2026-08-31"]).toEqual({ "rate:Good": 2, introduce: 1 });
  });
});
