// Source preprocessing applied before Markdoc parses a note.

/** How many extra blank lines in a row are honoured. */
const MAX_EXTRA_GAPS = 3;

// Written as an escape on purpose: as a literal it is indistinguishable from a
// plain space, and a plain space here would silently disable the whole thing.
const NBSP = "\u00a0";

const FENCE = /^\s*(```|~~~)/;

/**
 * Markdown collapses any run of blank lines into a single paragraph break, so
 * deliberate extra spacing in a note is lost before it reaches the renderer.
 * Keep it by turning each extra blank line into a line holding one
 * non-breaking space: CommonMark counts a line blank only when it is empty or
 * made of spaces and tabs, so this one survives as a paragraph of its own.
 *
 * The NBSP is then dropped from that paragraph's content, so what reaches the
 * page is an empty `<p>`. Note that this does *not* space itself out: an empty
 * block has no content holding its margins apart, so they collapse through it
 * and into its neighbours'. MarkdocContent gives `p:empty` an explicit height
 * for that reason — the two halves only work together.
 *
 * Blank lines inside fenced code blocks are part of the code and left alone,
 * as are runs at the very start or end, which would only pad the edges.
 * Indented (four-space) code blocks are not tracked, so a run of blank lines
 * inside one would be expanded; notes here use fences.
 */
export function expandBlankLines(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  let blanks = 0;

  function flushBlanks() {
    // Nothing above them yet: a run at the top of the note is just padding.
    if (blanks === 0 || out.length === 0) {
      blanks = 0;
      return;
    }
    out.push("");
    const extra = Math.min(blanks - 1, MAX_EXTRA_GAPS);
    for (let i = 0; i < extra; i++) out.push(NBSP, "");
    blanks = 0;
  }

  for (const line of lines) {
    if (inFence) {
      out.push(line);
      if (FENCE.test(line)) inFence = false;
      continue;
    }
    if (FENCE.test(line)) {
      flushBlanks();
      inFence = true;
      out.push(line);
      continue;
    }
    if (line.trim() === "") {
      blanks++;
      continue;
    }
    flushBlanks();
    out.push(line);
  }

  // Trailing blanks are deliberately dropped, along with `blanks`.
  return out.join("\n");
}
