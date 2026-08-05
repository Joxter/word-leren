import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdocContent from "./MarkdocContent";

// The spacing rules in MarkdocContent are all child selectors on the prose
// container, so they only work while the blocks are its *direct* children.
// Markdoc wraps a document in an <article>, which silently broke every one of
// them — these tests pin the flat structure down.

function html(content: string): string {
  return renderToStaticMarkup(<MarkdocContent content={content} />);
}

describe("MarkdocContent", () => {
  it("renders blocks as direct children, with no wrapper in between", () => {
    expect(html("one\n\ntwo")).toMatch(
      /^<div class="[^"]*"><p>one<\/p><p>two<\/p><\/div>$/,
    );
  });

  it("does not wrap the document in an article", () => {
    expect(html("one")).not.toContain("<article>");
  });

  it("adds a spacer block per extra blank line", () => {
    expect(html("one\n\ntwo")).toContain("<p>one</p><p>two</p>");
    expect(html("one\n\n\ntwo")).toContain("<p>one</p><p></p><p>two</p>");
    expect(html("one\n\n\n\ntwo")).toContain(
      "<p>one</p><p></p><p></p><p>two</p>",
    );
  });

  it("renders nothing for blank content", () => {
    expect(html("   \n  ")).toBe("");
  });
});
