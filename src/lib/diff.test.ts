import { describe, it, expect } from "vitest";
import { diffTyped } from "./diff";

// Compact the result into a string: wrong characters are wrapped in [],
// missing (skipped) characters in {}.
function render(typed: string, correct: string): string {
  return diffTyped(typed, correct)
    .map((c) =>
      c.kind === "wrong"
        ? `[${c.ch}]`
        : c.kind === "missing"
          ? `{${c.ch}}`
          : c.ch,
    )
    .join("");
}

describe("diffTyped", () => {
  it("marks everything ok on an exact match", () => {
    expect(render("fiets", "fiets")).toBe("fiets");
  });

  it("is case-insensitive", () => {
    expect(render("Fiets", "fiets")).toBe("Fiets");
  });

  it("marks a single wrong letter without cascading", () => {
    expect(render("fiats", "fiets")).toBe("fi[a]{e}ts");
  });

  it("marks extra letters as wrong", () => {
    expect(render("fietsen", "fiets")).toBe("fiets[e][n]");
  });

  it("shows missing letters as gaps", () => {
    expect(render("legen", "leggen")).toBe("leg{g}en");
    expect(render("fits", "fiets")).toBe("fi{e}ts");
  });

  it("marks the whole answer wrong when nothing matches", () => {
    expect(render("xyz", "abc")).toBe("[x][y][z]{a}{b}{c}");
  });

  it("shows an entirely skipped answer as all missing", () => {
    expect(render("", "fiets")).toBe("{f}{i}{e}{t}{s}");
  });
});
