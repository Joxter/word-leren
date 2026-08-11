import { describe, expect, it } from "vitest";
import { trimCardText } from "./cards";

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
