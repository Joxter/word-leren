import { describe, expect, it } from "vitest";
import { editEntry, trimCardText } from "./cards";

describe("trimCardText", () => {
  it("trims both sides and the note", () => {
    expect(
      trimCardText({
        aCard: "  de hond ",
        bCard: "\tthe dog",
        note: "woof \n",
      }),
    ).toEqual({ aCard: "de hond", bCard: "the dog", note: "woof" });
  });

  it("keeps the line breaks inside a note", () => {
    expect(
      trimCardText({ aCard: "", bCard: "", note: "\n een\n\ntwee\n" }).note,
    ).toBe("een\n\ntwee");
  });

  it("leaves the fields it doesn't own alone", () => {
    expect(
      trimCardText({
        aLang: "NL",
        bLang: "EN",
        aCard: " op ",
        bCard: " up ",
        note: "",
        audio: " audio/dict/op.mp3 ",
      }),
    ).toEqual({
      aLang: "NL",
      bLang: "EN",
      aCard: "op",
      bCard: "up",
      note: "",
      audio: " audio/dict/op.mp3 ",
    });
  });
});

describe("editEntry", () => {
  const before = { aCard: "hond", bCard: "dog", note: "een dier" };

  it("returns null when nothing changed", () => {
    expect(editEntry(before, { ...before })).toBe(null);
  });

  it("names the changed fields and keeps the old sides", () => {
    const entry = editEntry(before, { ...before, aCard: "de hond" })!;
    const e = Object.values(entry)[0];
    expect(e.kind).toBe("edit");
    expect(e.fields).toEqual(["aCard"]);
    expect(e.prev).toEqual({ aCard: "hond" });
  });

  it("records that the note changed but not what it said", () => {
    const entry = editEntry(before, { ...before, note: "een groot dier" })!;
    const e = Object.values(entry)[0];
    expect(e.fields).toEqual(["note"]);
    expect(e.prev).toEqual({});
  });

  it("treats a card that never had a note as an empty one", () => {
    expect(
      editEntry(
        { aCard: "op", bCard: "up" },
        { aCard: "op", bCard: "up", note: "" },
      ),
    ).toBe(null);
  });
});
