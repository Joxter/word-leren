// Span arithmetic for examples: which fragments of a sentence a card hides.
// Split out of `examples.ts` (which re-exports it, so every old import still
// works) for one reason: the MCP server needs `anchorSpans` to turn the
// fragments a chat sends as plain text into offsets, and `examples.ts` reaches
// `../db`, which opens a socket the moment it is imported.

/** A hidden fragment of an example's side A. `end` is exclusive. */
export interface Span {
  start: number;
  end: number;
  /**
   * A copy of `aText.slice(start, end)`. Offsets go stale as soon as the
   * sentence is edited, so this is what actually identifies the fragment —
   * see `anchorSpans`.
   */
  text: string;
}

/**
 * Clamp spans to the text, drop empty ones, sort them, merge any that touch or
 * overlap, and refresh each `text` from the source. Spans separated by so much
 * as a space are left apart, so they stay two blanks in the UI.
 */
export function normalizeSpans(spans: Span[], text: string): Span[] {
  const clamped = spans
    .map((s) => ({
      start: Math.max(0, Math.min(s.start, text.length)),
      end: Math.max(0, Math.min(s.end, text.length)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const s of clamped) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }

  return merged.map((s) => ({ ...s, text: text.slice(s.start, s.end) }));
}

export interface AnchorResult {
  /** Spans that still point at their fragment, re-anchored where needed. */
  spans: Span[];
  /** Spans whose fragment is gone from the sentence entirely. */
  broken: Span[];
}

/**
 * Re-attach spans to a sentence that may have been edited since they were
 * saved. A span whose offsets still slice out its `text` is kept as-is;
 * otherwise the fragment is searched for, and the occurrence nearest the old
 * offset wins — that survives the usual edit (a typo fixed elsewhere shifts
 * everything by a character or two) even when the fragment repeats. Only a
 * fragment that no longer occurs at all is reported as broken.
 */
export function anchorSpans(text: string, spans: Span[]): AnchorResult {
  const found: Span[] = [];
  const broken: Span[] = [];

  for (const span of spans) {
    if (span.text && text.slice(span.start, span.end) === span.text) {
      found.push(span);
      continue;
    }
    const moved = span.text ? nearestOccurrence(text, span) : null;
    if (moved) found.push(moved);
    else broken.push(span);
  }

  return { spans: normalizeSpans(found, text), broken };
}

function nearestOccurrence(text: string, span: Span): Span | null {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = text.indexOf(span.text); i !== -1;) {
    const distance = Math.abs(i - span.start);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
    i = text.indexOf(span.text, i + 1);
  }
  if (best === -1) return null;
  return { start: best, end: best + span.text.length, text: span.text };
}

export interface Segment {
  text: string;
  /** True for the parts covered by a span (the ones a cloze hides). */
  blank: boolean;
}

/**
 * Cut `text` into alternating plain and covered pieces. `spans` must already be
 * normalized (sorted, non-overlapping). Empty pieces are dropped, so a sentence
 * that starts with a blank doesn't lead with an empty plain segment.
 */
export function segmentText(text: string, spans: Span[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start > at)
      out.push({ text: text.slice(at, span.start), blank: false });
    out.push({ text: text.slice(span.start, span.end), blank: true });
    at = span.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), blank: false });
  return out;
}

/** What the user is expected to type for a cloze: the fragments, in order. */
export function spansAnswer(spans: Span[]): string {
  return spans.map((s) => s.text).join(" ");
}

export interface Token {
  start: number;
  end: number;
  text: string;
  /** Word tokens are the ones the span picker lets you click. */
  word: boolean;
}

// Letters and digits, plus internal apostrophes and hyphens so "auto's" and
// "twee-en-twintig" stay one clickable token.
const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

/** Split a sentence into word tokens and the punctuation/space runs between. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  WORD_RE.lastIndex = 0;
  for (let m = WORD_RE.exec(text); m; m = WORD_RE.exec(text)) {
    if (m.index > at) {
      out.push({
        start: at,
        end: m.index,
        text: text.slice(at, m.index),
        word: false,
      });
    }
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      word: true,
    });
    at = m.index + m[0].length;
  }
  if (at < text.length) {
    out.push({
      start: at,
      end: text.length,
      text: text.slice(at),
      word: false,
    });
  }
  return out;
}

/** Whether any span covers part of `[start, end)`. */
export function isCovered(spans: Span[], start: number, end: number): boolean {
  return spans.some((s) => s.start < end && start < s.end);
}

/**
 * Click behaviour for the span picker: a range that already overlaps a blank
 * clears the blanks it touches, an untouched one becomes a new blank.
 */
export function toggleSpan(
  spans: Span[],
  start: number,
  end: number,
  text: string,
): Span[] {
  if (isCovered(spans, start, end)) {
    return spans.filter((s) => !(s.start < end && start < s.end));
  }
  return normalizeSpans(
    [...spans, { start, end, text: text.slice(start, end) }],
    text,
  );
}

/**
 * Spans from bare fragments — what a caller that can't click words has to send
 * instead (the MCP server). Each fragment is anchored at its first occurrence;
 * one that doesn't occur at all comes back in `broken`, which is the only
 * check there is on a blank somebody made up. Blank-only fragments are
 * dropped, not reported: they are typing, not a mistake worth a message.
 */
export function spansFromTexts(
  text: string,
  fragments: string[],
): AnchorResult {
  return anchorSpans(
    text,
    fragments
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => ({ start: 0, end: 0, text: f })),
  );
}

/**
 * Spans from word positions — 0-based, punctuation not counted, exactly the
 * tokens the app's picker lets you click (`SpanBoard`). This is how a caller
 * that can't click picks blanks: positions have no repeated-fragment problem
 * and no punctuation to get wrong ("op" vs "op."). Positions past the end of
 * the sentence come back in `missing` rather than being ignored.
 */
export function spansFromWords(
  text: string,
  positions: number[],
): { spans: Span[]; missing: number[] } {
  const words = tokenize(text).filter((t) => t.word);
  return {
    spans: normalizeSpans(
      positions.filter((n) => words[n]).map((n) => ({ ...words[n] })),
      text,
    ),
    missing: positions.filter((n) => !words[n]),
  };
}

/** The sentence's words with their positions, `0:Ik 1:sta 2:elke` — what a
 *  caller reads before naming any. Cheaper than a list of objects and it is
 *  read, never parsed. */
export function numberWords(text: string): string {
  return tokenize(text)
    .filter((t) => t.word)
    .map((t, i) => `${i}:${t.text}`)
    .join(" ");
}
