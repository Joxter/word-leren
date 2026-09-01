import { describe, it, expect } from "vitest";
import { brief, events, byDay, tally, type DeckCard } from "./deck";

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

  it("leaves out the retired manual queue's own events", () => {
    // place/top/move outnumber the study history 12:1 and say nothing about
    // how a card is doing. The rows stay in the database, just not here.
    const out = events([
      card({
        log: {
          a: { at: 1, lineId: "L", kind: "place", amount: 3 },
          b: { at: 2, lineId: "L", kind: "top", amount: 0 },
          c: { at: 3, lineId: "L", kind: "move", amount: 1 },
          d: { at: 4, lineId: "L", kind: "known", amount: 0 },
        },
      }),
    ]);
    expect(out.map((e) => e.kind)).toEqual(["known"]);
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

describe("brief keeps lists small", () => {
  it("leaves the note out — it belongs to get_card", () => {
    // Notes carry whole dictionary entries; 500 of them made a 215 KB reply.
    const b = brief(card({ note: "x".repeat(5000) }));
    expect(JSON.stringify(b)).not.toContain("xxx");
  });
});

describe("tally", () => {
  const now = new Date(2026, 8, 1, 12).getTime();
  const srs = (over: Partial<DeckCard["srs"]> & { due: number }) => ({
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    ...over,
  });

  it("counts states, and due separately from due-by-midnight", () => {
    const out = tally(
      [
        card(),
        card({ srs: srs({ due: now - 1000 }) }),
        card({ srs: srs({ due: now + 6 * 3600e3 }) }),
        card({ srs: srs({ due: now + 5 * 864e5 }) }),
        card({ srs: srs({ due: now + 60e3, state: 1 }) }),
      ],
      now,
    );
    expect(out).toEqual({
      unstudied: 1,
      review: 3,
      learning: 1,
      due: 1,
      dueToday: 3,
    });
  });
});

describe("brief lines", () => {
  it("names the lines a card is in, and omits the key when it is in none", () => {
    const c = card({ queues: { l1: { rank: "a0" }, l2: { rank: "a1" } } });
    expect(brief(c, { l1: "default", l2: "English" }).lines).toEqual([
      "default",
      "English",
    ]);
    expect(brief(card()).lines).toBeUndefined();
  });
});
