import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HintLetters from "./HintLetters";

// `inline` mode renders a cloze hint inside the prompt sentence itself, so the
// text around the gaps has to keep the type it was rendered with — no classes
// of its own, no per-word flex spacing. Character indices are the other half of
// the contract: they address `text` directly, newlines included.

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

function text(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

const noop = () => {};

describe("HintLetters inline", () => {
  const sentence = "Ik ga naar huis";
  // "huis"
  const hidden = [{ start: 11, end: 15 }];

  it("leaves the untouched words as bare, unstyled text", () => {
    const markup = html(
      <HintLetters
        inline
        text={sentence}
        hidden={hidden}
        revealed={[]}
        onReveal={noop}
      />,
    );
    expect(markup).toContain("<span>Ik</span>");
    expect(markup).toContain("<span>naar</span>");
    // The words that stay visible read as words, spaces and all.
    expect(text(markup)).toBe("Ik ga naar ");
  });

  it("boxes one letter of the hidden fragment at a time", () => {
    const markup = html(
      <HintLetters
        inline
        text={sentence}
        hidden={hidden}
        revealed={[]}
        onReveal={noop}
      />,
    );
    expect(markup.match(/<button/g)).toHaveLength(4);
  });

  it("reveals a box by its index in the text", () => {
    const revealed: boolean[] = [];
    revealed[11] = true;
    const markup = html(
      <HintLetters
        inline
        text={sentence}
        hidden={hidden}
        revealed={revealed}
        onReveal={noop}
      />,
    );
    expect(text(markup)).toBe("Ik ga naar h");
  });

  it("counts the newline, so later lines still line up with `hidden`", () => {
    const multi = "Ik ga\nnaar huis";
    // "naar" on the second line: 6..10 counting the newline at 5.
    const revealed: boolean[] = [];
    for (let i = 6; i < 10; i++) revealed[i] = true;
    const markup = html(
      <HintLetters
        inline
        text={multi}
        hidden={[{ start: 6, end: 10 }]}
        revealed={revealed}
        onReveal={noop}
      />,
    );
    expect(text(markup)).toBe("Ik ga\nnaar huis");
    expect(markup.match(/<button/g)).toHaveLength(4);
  });
});

describe("HintLetters block", () => {
  it("boxes every letter when nothing is marked as hidden", () => {
    const markup = html(
      <HintLetters text="huis, ja" revealed={[]} onReveal={noop} />,
    );
    // Six letters; the comma and the space are not guessable.
    expect(markup.match(/<button/g)).toHaveLength(6);
    expect(text(markup)).toBe(",");
  });
});
