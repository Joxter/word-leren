import { describe, it, expect } from "vitest";
import {
  deckInfo,
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
