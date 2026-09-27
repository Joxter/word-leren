import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ExampleText from "./ExampleText";

function text(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<[^>]*>/g, "");
}

describe("ExampleText blank", () => {
  it("keeps the spaces inside a multi-word fragment", () => {
    // "gaat weg" as one span, the way a drag-select saves it.
    const sentence = "Hij gaat weg.";
    const spans = [{ start: 4, end: 12, text: "gaat weg" }];
    expect(text(<ExampleText text={sentence} spans={spans} mode="blank" />)).toBe(
      "Hij ____ ___.",
    );
  });

  it("gives a one-letter word two underscores", () => {
    const spans = [{ start: 0, end: 1, text: "a" }];
    expect(text(<ExampleText text="a b" spans={spans} mode="blank" />)).toBe(
      "__ b",
    );
  });
});
