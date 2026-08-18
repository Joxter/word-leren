import { describe, it, expect } from "vitest";
import {
  cardRuns,
  deckInfo,
  entryCardBack,
  entryCardFront,
  findOwnCard,
  senseGroups,
  searchDictionary,
  WIKTIONARY,
  type DictEntry,
} from "./dictionary";

// The dictionary now merges two very different kinds of source: the decks give
// short learner translations, Wiktionary gives numbered definitions per part of
// speech. These pin down the split, and the verb-form search that the new
// `pastPl` field would otherwise have quietly broken.

function entry(over: Partial<DictEntry> = {}): DictEntry {
  return { word: "huis", info: [], ...over };
}

const deck = (translation: string, source = "frequency") => ({
  source,
  translation,
});
const sense = (translation: string, pos: string, rest = {}) => ({
  source: WIKTIONARY,
  pos,
  translation,
  ...rest,
});

describe("deckInfo", () => {
  it("keeps the decks and drops the Wiktionary senses", () => {
    const e = entry({
      info: [
        deck("house"),
        sense("a house, home", "noun"),
        deck("home", "csv"),
      ],
    });
    expect(deckInfo(e).map((i) => i.translation)).toEqual(["house", "home"]);
  });
});

describe("senseGroups", () => {
  it("groups senses by part of speech, in the order they appear", () => {
    const e = entry({
      info: [
        deck("point"),
        sense("a dot", "noun"),
        sense("to point at", "verb"),
        sense("the tip of something", "noun"),
      ],
    });
    expect(senseGroups(e)).toEqual([
      {
        pos: "noun",
        senses: [sense("a dot", "noun"), sense("the tip of something", "noun")],
      },
      { pos: "verb", senses: [sense("to point at", "verb")] },
    ]);
  });

  it("returns nothing for an entry the decks alone cover", () => {
    expect(senseGroups(entry({ info: [deck("house")] }))).toEqual([]);
  });
});

describe("searchDictionary", () => {
  const gaan = entry({
    word: "gaan",
    verb: { past: "ging", pastPl: "gingen", participle: "gegaan" },
    info: [deck("to go")],
  });
  const entries = [gaan, entry({ word: "huis", info: [deck("house")] })];

  it("finds a verb by its past plural", () => {
    // `pastPl` is its own field only since the Wiktionary import; before that
    // the decks packed it into `past` as "ging, gingen".
    expect(searchDictionary(entries, "gingen").map((e) => e.word)).toEqual([
      "gaan",
    ]);
  });

  it("still finds it by past singular and participle", () => {
    expect(searchDictionary(entries, "ging")[0].word).toBe("gaan");
    expect(searchDictionary(entries, "gegaan")[0].word).toBe("gaan");
  });

  it("searches Wiktionary definitions too", () => {
    const found = searchDictionary(
      [entry({ word: "knopje", info: [sense("a small button", "noun")] })],
      "small button",
    );
    expect(found.map((e) => e.word)).toEqual(["knopje"]);
  });
});

// Making a card out of an entry: what its two sides say, and whether the user
// already has a card for the word (a whole-word test — Dutch compounds).

describe("entryCardFront", () => {
  it("writes the article in, the way the decks do", () => {
    expect(entryCardFront(entry({ word: "hond", article: "de" }))).toBe(
      "de hond",
    );
    expect(entryCardFront(entry({ word: "lopen" }))).toBe("lopen");
  });
});

describe("entryCardBack", () => {
  it("joins the decks' translations, merged", () => {
    const e = entry({ info: [deck("lock"), deck("the lock", "csv")] });
    expect(entryCardBack(e)).toBe("the lock");
  });

  it("falls back to the first two Wiktionary senses", () => {
    const e = entry({
      info: [
        sense("a house, home", "noun"),
        sense("a building", "noun"),
        sense("a third one", "noun"),
      ],
    });
    expect(entryCardBack(e)).toBe("a house, home; a building");
  });

  it("is empty when the entry means nothing at all", () => {
    expect(entryCardBack(entry())).toBe("");
  });
});

describe("findOwnCard", () => {
  const runs = cardRuns([
    { id: "1", aCard: "de hond" },
    { id: "2", aCard: "hondenhok" },
    { id: "3", aCard: "groot, grote" },
  ]);

  it("finds the word inside a card that carries more than it", () => {
    expect(findOwnCard(runs, "hond")?.id).toBe("1");
    expect(findOwnCard(runs, "grote")?.id).toBe("3");
  });

  it("does not count a word buried in a compound", () => {
    expect(
      findOwnCard(cardRuns([{ id: "2", aCard: "hondenhok" }]), "hond"),
    ).toBeNull();
  });

  it("is null when no card has the word", () => {
    expect(findOwnCard(runs, "kat")).toBeNull();
  });
});
