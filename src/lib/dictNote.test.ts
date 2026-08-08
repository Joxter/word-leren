import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import MarkdocContent from "../components/MarkdocContent";
import {
  buildDictBlock,
  withDictBlock,
  hasDictBlock,
  DICT_OPEN,
} from "./dictNote";
import { WIKTIONARY, type DictEntry } from "./dictionary";

// The block is generated text that has to survive a round trip through Markdoc,
// so these render it rather than only checking the string: an item that loses
// its examples to a stray indent looks fine as source and wrong on the page.

const sense = (translation: string, pos: string, rest = {}) => ({
  source: WIKTIONARY,
  pos,
  translation,
  ...rest,
});

const huis: DictEntry = {
  word: "huis",
  article: "het",
  info: [
    { source: "frequency", translation: "house" },
    sense("a house, home; residence", "noun", {
      synonyms: ["woning"],
      examples: "Ik woon in een klein huis.\nI live in a small house.",
    }),
    sense("a genealogical house", "noun"),
  ],
};

const gaan: DictEntry = {
  word: "gaan",
  verb: { past: "ging", pastPl: "gingen", participle: "gegaan" },
  info: [sense("to go", "verb")],
};

function render(note: string): string {
  return renderToStaticMarkup(
    React.createElement(MarkdocContent, { content: note }),
  );
}

describe("buildDictBlock", () => {
  it("wraps the entry in the dict tag", () => {
    const block = buildDictBlock(huis);
    expect(block.startsWith(DICT_OPEN)).toBe(true);
    expect(block.trimEnd().endsWith("{% /dict %}")).toBe(true);
  });

  it("renders as a collapsed details with one item per meaning", () => {
    const html = render(buildDictBlock(huis));
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Dictionary</summary>");
    expect(html).toContain("<ol>");
    expect(html.match(/<li>/g)).toHaveLength(2);
    // The meaning carries the item, so it is bold; the example under it is not.
    expect(html).toContain("<strong>a house, home; residence</strong>");
    expect(html).toContain("woning");
  });

  it("keeps a sense's examples inside its own item", () => {
    const html = render(buildDictBlock(huis));
    const first = html.slice(html.indexOf("<li>"), html.indexOf("</li>"));
    expect(first).toContain("Ik woon in een klein huis.");
    expect(first).toContain("I live in a small house.");
    // Hard breaks, not separate paragraphs — the item stays one block.
    expect(first).toContain("<br");
  });

  it("keeps examples in the item past the tenth meaning", () => {
    // Examples are indented three spaces, but "10. " is a four-character
    // marker. It holds because a hard break keeps the lines in the same
    // paragraph — `aan` really does have ten prepositional senses.
    const many: DictEntry = {
      word: "aan",
      info: Array.from({ length: 11 }, (_, i) =>
        sense(`meaning ${i + 1}`, "prep", {
          examples: `voorbeeld ${i + 1}\nexample ${i + 1}`,
        }),
      ),
    };
    const items = render(buildDictBlock(many)).split("<li>").slice(1);
    expect(items).toHaveLength(11);
    expect(items[9]).toContain("voorbeeld 10");
    expect(items[9]).toContain("example 10");
    expect(items[10]).toContain("voorbeeld 11");
  });

  it("puts the verb forms on the verb heading", () => {
    const html = render(buildDictBlock(gaan));
    expect(html).toContain("past");
    expect(html).toContain("gingen");
    expect(html).toContain("gegaan");
  });

  it("says nothing for an entry with no Wiktionary data", () => {
    expect(
      buildDictBlock({
        word: "bagagelabel",
        info: [{ source: "csv", translation: "luggage tag" }],
      }),
    ).toBe("");
  });
});

describe("withDictBlock", () => {
  const block = buildDictBlock(huis);

  it("appends below whatever the note already said", () => {
    const note = withDictBlock("Мой текст", block);
    expect(note.startsWith("Мой текст")).toBe(true);
    expect(hasDictBlock(note)).toBe(true);
  });

  it("replaces the old block instead of stacking a second one", () => {
    const once = withDictBlock("Мой текст", block);
    const twice = withDictBlock(once, buildDictBlock(gaan));
    expect(twice.match(/\{% dict %\}/g)).toHaveLength(1);
    expect(twice.startsWith("Мой текст")).toBe(true);
    expect(twice).toContain("gegaan");
    expect(twice).not.toContain("woning");
  });

  it("drops the block when there is nothing to fill in", () => {
    const note = withDictBlock(withDictBlock("Мой текст", block), "");
    expect(note).toBe("Мой текст");
    expect(hasDictBlock(note)).toBe(false);
  });
});

describe("MarkdocContent", () => {
  it("still renders the built-in table tag alongside the new one", () => {
    const html = render("{% table %}\n* A\n* B\n---\n* 1\n* 2\n{% /table %}");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });
});
