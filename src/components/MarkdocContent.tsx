import Markdoc, { type Config, type Node, type Tag } from "@markdoc/markdoc";
import React from "react";
import { css } from "@linaria/core";
import { expandBlankLines } from "../lib/markdoc";

// Spacing follows GitHub's markdown stylesheet: every block clears space
// below itself, headings additionally take space above, and the last child
// never trails a margin. Two properties of that model matter here and are why
// the hand-rolled alternatives kept breaking:
//
//  - the selectors are descendant, not child, so they keep working whatever
//    wrapper element a renderer decides to put in between;
//  - it is the layout every markdown tool produces, so a note looks the same
//    here as it does anywhere else.
const BLOCK_GAP = "16px";
const HEADING_GAP_ABOVE = "24px";
// Tighter than the prose around it, which is what actually sets how dense a
// list reads: a plain "- a\n- b" list has no blocks or margins inside its
// items, so line-height is the only thing between one item and the next.
const LIST_LINE_HEIGHT = "1.45";
// Blocks nested inside an item. Only markdown that puts them there is
// affected — a nested list, or an item holding more than one paragraph.
const LIST_INNER_GAP = "4px";

const prose = css`
  font-size: 14px;
  line-height: 1.6;
  color: #222;

  p,
  ul,
  ol,
  pre,
  blockquote,
  table,
  hr {
    margin: 0 0 ${BLOCK_GAP};
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: ${HEADING_GAP_ABOVE} 0 ${BLOCK_GAP};
    font-weight: 600;
    line-height: 1.25;
  }

  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }

  h1 {
    font-size: 24px;
  }
  h2 {
    font-size: 20px;
  }
  h3,
  h4 {
    font-size: 16px;
  }
  h5,
  h6 {
    font-size: 14px;
  }
  h6 {
    color: #666;
  }

  ul,
  ol {
    padding-left: 24px;
  }
  li {
    margin: 0;
    line-height: ${LIST_LINE_HEIGHT};
  }
  /* A nested list belongs to its item, not to the flow around it. */
  li > ul,
  li > ol {
    margin: ${LIST_INNER_GAP} 0 0;
  }
  li > p {
    margin-bottom: ${LIST_INNER_GAP};
  }
  li > *:last-child {
    margin-bottom: 0;
  }

  /* An empty paragraph is a spacer standing in for an extra blank line in the
     source (see expandBlankLines). It needs a real height: an empty block has
     no content to keep its margins apart, so they collapse through it and
     into the neighbours' — which is why margins alone can't space it. */
  p:empty {
    height: ${BLOCK_GAP};
    margin-bottom: 0;
  }

  strong {
    font-weight: 600;
  }
  em {
    font-style: italic;
  }

  code {
    font-family: monospace;
    background: #f0f0f0;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 13px;
  }

  pre {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
  }
  pre code {
    background: none;
    padding: 0;
  }

  blockquote {
    border-left: 3px solid #ddd;
    padding-left: 12px;
    color: #666;
  }
  blockquote > *:last-child {
    margin-bottom: 0;
  }

  a {
    color: #0066cc;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  hr {
    border: none;
    border-top: 1px solid #e0e0e0;
  }

  table {
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0 20px 0 0;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-weight: 600;
    color: #444;
  }

  /* The dict block. Closed by default, so a long entry costs one line. */
  details {
    margin: 0 0 ${BLOCK_GAP};
  }

  summary {
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #999;
    user-select: none;
  }

  summary:hover {
    color: #1a1a1a;
  }

  details[open] > summary {
    margin-bottom: 8px;
  }

  /* Opened, the entry sits indented under its summary. */
  details > *:not(summary) {
    margin-left: 12px;
  }
`;

// `{% dict %}` — the block scripts fill from the dictionary (see lib/dictNote).
// It renders collapsed, because a full entry is long enough to bury the card it
// belongs to, and closed is the right default for reference material.
//
// Spread over Markdoc's own tags rather than replacing them: `{% table %}` is
// one of those, and notes already use it.
const config = {
  tags: {
    ...Markdoc.tags,
    dict: {
      render: "details",
      children: ["paragraph", "list", "heading", "hr", "fence", "table"],
      transform(node: Node, cfg: Config) {
        return new Markdoc.Tag("details", {}, [
          new Markdoc.Tag("summary", {}, ["Dictionary"]),
          ...node.transformChildren(cfg),
        ]);
      },
    },
  },
};

export default function MarkdocContent({ content }: { content: string }) {
  if (!content.trim()) return null;

  const ast = Markdoc.parse(expandBlankLines(content));
  // Markdoc renders a document as an <article> wrapping the blocks. Render its
  // children instead: the first/last-child rules in `prose` are the one place
  // the styles still reach for a direct child, and through a wrapper they
  // would match only the wrapper — leaving a trailing margin under the note.
  const { children } = Markdoc.transform(ast, config) as Tag;

  return (
    <div className={prose}>
      {Markdoc.renderers.react(children, React) as React.ReactElement}
    </div>
  );
}
