import { describe, it, expect } from "vitest";
import { matchTier, rankMatches } from "./search";

interface Card {
  aCard: string;
  bCard: string;
  note?: string;
}

const card = (aCard: string, bCard = "", note?: string): Card => ({
  aCard,
  bCard,
  note,
});

/** The card search as every picker configures it. */
const rank = (cards: Card[], query: string, limit?: number) =>
  rankMatches(cards, query, {
    fields: (c) => [c.aCard, c.bCard, c.note],
    label: (c) => c.aCard,
    limit,
  }).map((c) => c.aCard);

describe("matchTier", () => {
  const tiers: [number, number, number] = [0, 1, 2];

  it("scores exact above prefix above substring", () => {
    expect(matchTier("lopen", "lopen", tiers)).toBe(0);
    expect(matchTier("lopende", "lopen", tiers)).toBe(1);
    expect(matchTier("aflopen", "lopen", tiers)).toBe(2);
  });

  it("is case-insensitive on the text side", () => {
    expect(matchTier("Lopen", "lopen", tiers)).toBe(0);
  });

  it("returns Infinity for a miss, empty text or no text", () => {
    expect(matchTier("lopen", "rennen", tiers)).toBe(Infinity);
    expect(matchTier("", "lopen", tiers)).toBe(Infinity);
    expect(matchTier(undefined, "lopen", tiers)).toBe(Infinity);
  });
});

describe("rankMatches", () => {
  it("matches nothing on an empty or blank query", () => {
    expect(rank([card("lopen")], "")).toEqual([]);
    expect(rank([card("lopen")], "   ")).toEqual([]);
  });

  it("puts an exact match first, then prefix, then substring", () => {
    const cards = [card("aflopen"), card("lopende"), card("lopen")];
    expect(rank(cards, "lopen")).toEqual(["lopen", "lopende", "aflopen"]);
  });

  it("ranks any side-A hit above an exact hit in a later field", () => {
    const cards = [
      card("de kat", "cat", "opstaan"),
      card("wakker worden", "to wake up", "opstaan"),
      card("uitstappen", "to get off", "like opstaan, separable"),
      card("opstaan", "to get up"),
    ];
    // Side A first; then side B; then the notes, exact before substring.
    expect(rank(cards, "opstaan")).toEqual([
      "opstaan",
      "de kat",
      "wakker worden",
      "uitstappen",
    ]);
  });

  it("prefers side B over the note", () => {
    const cards = [
      card("het huis", "house, home"),
      card("de deur", "door", "of a house"),
    ];
    expect(rank(cards, "house")).toEqual(["het huis", "de deur"]);
  });

  it("breaks a tie on the shorter label, then alphabetically", () => {
    const cards = [
      card("lopendeband"),
      card("lopers"),
      card("lopen"),
      card("lopend"),
    ];
    expect(rank(cards, "lope")).toEqual([
      "lopen",
      "lopend",
      "lopers",
      "lopendeband",
    ]);
  });

  it("drops items nothing matches", () => {
    expect(rank([card("lopen"), card("rennen")], "lop")).toEqual(["lopen"]);
  });

  it("applies the limit after ranking, not before", () => {
    // The exact match is last in input order and must still survive the cut.
    const cards = [card("aflopen"), card("lopende"), card("lopen")];
    expect(rank(cards, "lopen", 1)).toEqual(["lopen"]);
  });

  it("keeps everything when no limit is given", () => {
    const cards = [card("lopen"), card("lopende"), card("aflopen")];
    expect(rank(cards, "lopen")).toHaveLength(3);
  });

  it("ignores fields an item doesn't have", () => {
    expect(rank([card("lopen")], "lopen")).toEqual(["lopen"]);
  });
});
