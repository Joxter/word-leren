import { describe, it, expect } from "vitest";
import {
  anchorSpans,
  blankedText,
  normalizeSpans,
  pickClozeLink,
  segmentText,
  spansAnswer,
  toggleSpan,
  tokenize,
  type Example,
  type ExampleLink,
  type Span,
} from "./examples";
import type { CardLog } from "./queue";

const SENTENCE = "Ik sta elke dag om 7 uur op.";

/** Build a span from a fragment's first occurrence. */
function at(text: string, fragment: string, from = 0): Span {
  const start = text.indexOf(fragment, from);
  return { start, end: start + fragment.length, text: fragment };
}

describe("normalizeSpans", () => {
  it("sorts, clamps and refreshes the covered text", () => {
    const spans = normalizeSpans(
      [
        { start: 25, end: 999, text: "stale" },
        { start: -5, end: 2, text: "" },
      ],
      SENTENCE,
    );
    expect(spans).toEqual([at(SENTENCE, "Ik"), at(SENTENCE, "op.")]);
  });

  it("merges overlapping and touching spans", () => {
    expect(
      normalizeSpans(
        [
          { start: 3, end: 6, text: "sta" },
          { start: 5, end: 10, text: "" },
        ],
        SENTENCE,
      ),
    ).toEqual([{ start: 3, end: 10, text: "sta elk" }]);
  });

  it("keeps spans that are only separated by a space apart", () => {
    const spans = normalizeSpans(
      [at(SENTENCE, "sta"), at(SENTENCE, "elke")],
      SENTENCE,
    );
    expect(spans.map((s) => s.text)).toEqual(["sta", "elke"]);
  });

  it("drops empty spans", () => {
    expect(normalizeSpans([{ start: 4, end: 4, text: "" }], SENTENCE)).toEqual(
      [],
    );
  });
});

describe("anchorSpans", () => {
  it("leaves valid spans alone", () => {
    const spans = [at(SENTENCE, "sta"), at(SENTENCE, "op.")];
    const res = anchorSpans(SENTENCE, spans);
    expect(res.spans).toEqual(spans);
    expect(res.broken).toEqual([]);
    expect(res.changed).toBe(false);
  });

  it("re-anchors after the sentence shifts", () => {
    const spans = [at(SENTENCE, "sta")];
    const edited = "En ik sta elke dag om 7 uur op.";
    const res = anchorSpans(edited, spans);
    expect(res.spans).toEqual([at(edited, "sta")]);
    expect(res.changed).toBe(true);
    expect(res.broken).toEqual([]);
  });

  it("picks the occurrence nearest the old offset when the fragment repeats", () => {
    // "op" occurs twice; the span used to sit on the second one, one character
    // further right than it now is.
    const text = "Ik sta op en ik sta weer op.";
    const second = at(text, "op", 10);
    const stale = { ...second, start: second.start + 1, end: second.end + 1 };
    expect(anchorSpans(text, [stale]).spans).toEqual([second]);
  });

  it("reports a fragment that is gone as broken", () => {
    const spans = [at(SENTENCE, "sta")];
    const res = anchorSpans("Ik loop elke dag.", spans);
    expect(res.spans).toEqual([]);
    expect(res.broken).toEqual(spans);
    expect(res.changed).toBe(true);
  });

  it("keeps the surviving spans when one breaks", () => {
    const edited = "Ik loop elke dag om 7 uur op.";
    const res = anchorSpans(edited, [at(SENTENCE, "sta"), at(SENTENCE, "op.")]);
    expect(res.spans.map((s) => s.text)).toEqual(["op."]);
    expect(res.broken.map((s) => s.text)).toEqual(["sta"]);
  });
});

describe("segmentText", () => {
  it("alternates plain and blank pieces", () => {
    const spans = normalizeSpans(
      [at(SENTENCE, "sta"), at(SENTENCE, "op")],
      SENTENCE,
    );
    expect(segmentText(SENTENCE, spans)).toEqual([
      { text: "Ik ", blank: false },
      { text: "sta", blank: true },
      { text: " elke dag om 7 uur ", blank: false },
      { text: "op", blank: true },
      { text: ".", blank: false },
    ]);
  });

  it("does not emit an empty piece when the text starts with a blank", () => {
    expect(segmentText(SENTENCE, [at(SENTENCE, "Ik")])).toEqual([
      { text: "Ik", blank: true },
      { text: " sta elke dag om 7 uur op.", blank: false },
    ]);
  });

  it("returns the whole text as one plain piece without spans", () => {
    expect(segmentText(SENTENCE, [])).toEqual([
      { text: SENTENCE, blank: false },
    ]);
  });
});

describe("spansAnswer / blankedText", () => {
  const spans = normalizeSpans(
    [at(SENTENCE, "sta"), at(SENTENCE, "op")],
    SENTENCE,
  );

  it("joins the fragments in order", () => {
    expect(spansAnswer(spans)).toBe("sta op");
  });

  it("replaces the fragments with the fill", () => {
    expect(blankedText(SENTENCE, spans)).toBe("Ik ___ elke dag om 7 uur ___.");
  });
});

describe("tokenize", () => {
  it("separates words from the runs between them", () => {
    expect(tokenize("Hij is op!").map((t) => [t.text, t.word])).toEqual([
      ["Hij", true],
      [" ", false],
      ["is", true],
      [" ", false],
      ["op", true],
      ["!", false],
    ]);
  });

  it("keeps internal apostrophes and hyphens inside one word", () => {
    expect(
      tokenize("auto's twee-en-twintig")
        .filter((t) => t.word)
        .map((t) => t.text),
    ).toEqual(["auto's", "twee-en-twintig"]);
  });

  it("reports offsets that slice back to the token", () => {
    const text = "  Ik sta op. ";
    for (const t of tokenize(text)) {
      expect(text.slice(t.start, t.end)).toBe(t.text);
    }
  });
});

describe("pickClozeLink", () => {
  const example = { id: "e1", aText: SENTENCE } as Example;

  function link(id: string, spanCount = 1): ExampleLink {
    return {
      id,
      createdAt: 0,
      example,
      spans: spanCount ? [at(SENTENCE, "sta")] : [],
    };
  }

  function log(entries: [string, number][]): CardLog {
    return Object.fromEntries(
      entries.map(([linkId, at], i) => [
        `ev${i}`,
        { at, lineId: "l", kind: "place", amount: 8, linkId },
      ]),
    );
  }

  it("returns nothing when there are no links", () => {
    expect(pickClozeLink([], undefined)).toBeUndefined();
  });

  it("skips links that blank nothing", () => {
    expect(pickClozeLink([link("a", 0)], undefined)).toBeUndefined();
  });

  it("skips links whose example didn't load", () => {
    const orphan = { id: "a", createdAt: 0, spans: [at(SENTENCE, "sta")] };
    expect(pickClozeLink([orphan], undefined)).toBeUndefined();
  });

  it("prefers a link that has never been answered", () => {
    const links = [link("a"), link("b")];
    expect(pickClozeLink(links, log([["a", 500]]))?.id).toBe("b");
  });

  it("picks the least recently answered", () => {
    const links = [link("a"), link("b"), link("c")];
    const history = log([
      ["a", 300],
      ["b", 100],
      ["c", 200],
    ]);
    expect(pickClozeLink(links, history)?.id).toBe("b");
  });

  it("ignores events from other cards' modes (no linkId)", () => {
    const links = [link("a")];
    expect(pickClozeLink(links, log([["", 900]]))?.id).toBe("a");
  });

  it("is stable across calls with the same log", () => {
    const links = [link("a"), link("b")];
    const history = log([["a", 100]]);
    expect(pickClozeLink(links, history)?.id).toBe(
      pickClozeLink(links, history)?.id,
    );
  });
});

describe("toggleSpan", () => {
  it("adds a blank for an untouched range", () => {
    const spans = toggleSpan([], 3, 6, SENTENCE);
    expect(spans).toEqual([{ start: 3, end: 6, text: "sta" }]);
  });

  it("clears the blanks a range overlaps", () => {
    const spans = [at(SENTENCE, "sta"), at(SENTENCE, "elke")];
    expect(toggleSpan(spans, 3, 6, SENTENCE)).toEqual([at(SENTENCE, "elke")]);
  });

  it("clears every blank a wide range touches", () => {
    const spans = [at(SENTENCE, "sta"), at(SENTENCE, "elke")];
    expect(toggleSpan(spans, 0, SENTENCE.length, SENTENCE)).toEqual([]);
  });
});
