import { describe, it, expect } from "vitest";
import { mergeContained } from "./translations";

const sources = ["aa", "bb", "cc", "dd", "ee"];

// Shorthand: build translations, each with a single same-named source.
const t = (...texts: string[]) =>
  texts.map((text, i) => ({ text, sources: [sources[i]] }));

describe("mergeContained", () => {
  it("merges a shorter translation into the longer one that contains it", () => {
    expect(mergeContained(t("lock", "the lock"))).toEqual([
      { sources: ["bb", "aa"], text: "the lock" },
    ]);
  });

  it("merges regardless of input order", () => {
    expect(mergeContained(t("the lock", "lock"))).toEqual([
      { sources: ["aa", "bb"], text: "the lock" },
    ]);
  });

  it("treats each translation as one atomic substring", () => {
    // "can" is a substring of "to be able to, can", so it collapses in.
    expect(mergeContained(t("to be able to, can", "can"))).toEqual([
      { sources: ["aa", "bb"], text: "to be able to, can" },
    ]);
  });

  it("drops exact duplicates that differ only in case/whitespace", () => {
    expect(mergeContained(t("The Lock", "the   lock"))).toEqual([
      { sources: ["aa", "bb"], text: "The Lock" },
    ]);
  });

  it("keeps unrelated translations and preserves their original order", () => {
    expect(mergeContained(t("cat", "dog", "bird"))).toEqual([
      { sources: ["aa"], text: "cat" },
      { sources: ["bb"], text: "dog" },
      { sources: ["cc"], text: "bird" },
    ]);
  });

  it("folds the dropped translation's sources into the survivor", () => {
    const merged = mergeContained([
      { text: "the lock", sources: ["common"] },
      { text: "lock", sources: ["frequency"] },
    ]);
    expect(merged).toEqual([
      { text: "the lock", sources: ["common", "frequency"] },
    ]);
  });

  it("does not duplicate a source already present on the survivor", () => {
    const merged = mergeContained([
      { text: "the lock", sources: ["common"] },
      { text: "lock", sources: ["common"] },
    ]);
    expect(merged).toEqual([{ text: "the lock", sources: ["common"] }]);
  });

  it("returns an empty array for no translations", () => {
    expect(mergeContained([])).toEqual([]);
  });
});
