import { describe, it, expect } from "vitest";
import Markdoc from "@markdoc/markdoc";
import { expandBlankLines } from "./markdoc";

/** Top-level tag names Markdoc produces for `src`, e.g. ["p", "p"]. */
function blocks(src: string): string[] {
  const rendered = Markdoc.transform(Markdoc.parse(src)) as {
    children: { name: string; children: unknown[] }[];
  };
  return rendered.children.map((c) => c.name);
}

describe("expandBlankLines", () => {
  it("leaves an ordinary paragraph break alone", () => {
    expect(expandBlankLines("a\n\nb")).toBe("a\n\nb");
  });

  it("turns each extra blank line into one spacer paragraph", () => {
    expect(blocks(expandBlankLines("a\n\nb"))).toEqual(["p", "p"]);
    expect(blocks(expandBlankLines("a\n\n\nb"))).toEqual(["p", "p", "p"]);
    expect(blocks(expandBlankLines("a\n\n\n\nb"))).toEqual([
      "p",
      "p",
      "p",
      "p",
    ]);
  });

  it("renders the spacers as empty paragraphs, so they only add margin", () => {
    const rendered = Markdoc.transform(
      Markdoc.parse(expandBlankLines("a\n\n\nb")),
    ) as { children: { children: unknown[] }[] };
    expect(rendered.children[1].children).toEqual([]);
  });

  it("caps a long run of blank lines", () => {
    const many = "a" + "\n".repeat(20) + "b";
    // 2 real paragraphs + at most 3 spacers.
    expect(blocks(expandBlankLines(many))).toHaveLength(5);
  });

  it("keeps blank lines inside a fenced code block", () => {
    const src = "a\n\n```\none\n\n\n\ntwo\n```\n\nb";
    expect(expandBlankLines(src)).toBe(src);
  });

  it("still expands after a fence closes", () => {
    const src = "```\ncode\n```\n\n\na";
    expect(blocks(expandBlankLines(src))).toEqual(["pre", "p", "p"]);
  });

  it("drops runs at the very start and end", () => {
    expect(expandBlankLines("\n\n\n\na")).toBe("a");
    expect(expandBlankLines("a\n\n\n\n")).toBe("a");
  });

  it("normalises CRLF", () => {
    expect(expandBlankLines("a\r\n\r\nb")).toBe("a\n\nb");
  });
});
