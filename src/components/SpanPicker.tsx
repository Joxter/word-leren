import { useRef, useState } from "react";
import { css } from "@linaria/core";
import {
  isCovered,
  normalizeSpans,
  spansAnswer,
  toggleSpan,
  tokenize,
  type Span,
} from "../lib/examples";

const wrap = css`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const sentence = css`
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
  background: #fff;
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
`;

const word = css`
  cursor: pointer;
  border-radius: 3px;
  padding: 0.1em 0.15em;
  border-bottom: 1px dashed #d5d5d5;

  &:hover {
    background: #f0f0f0;
  }
`;

const wordPicked = css`
  background: #fff3c4;
  border-bottom: 1px solid #d9a300;

  &:hover {
    background: #ffe89a;
  }
`;

const emptyText = css`
  color: #bbb;
  font-style: italic;
  font-size: 0.85rem;
`;

const toolbar = css`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
`;

const toolBtn = css`
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  color: #444;
  cursor: pointer;

  &:hover {
    border-color: #999;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const answerPreview = css`
  font-size: 0.75rem;
  color: #666;
  margin-left: auto;

  b {
    font-weight: 600;
    color: #1a1a1a;
  }
`;

const hint = css`
  font-size: 0.7rem;
  color: #999;
`;

interface Props {
  text: string;
  spans: Span[];
  onChange: (spans: Span[]) => void;
}

/**
 * Picks which fragments of a sentence belong to a card. Clicking a word toggles
 * it, which covers nearly everything including separable verbs (two clicks:
 * "sta" and "op"). For a partial word or a phrase, select the text and press
 * "Blank selection" — the words render as plain inline spans inside a div, so
 * ordinary text selection works across them.
 */
export default function SpanPicker({ text, spans, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hasSelection, setHasSelection] = useState(false);

  const tokens = tokenize(text);

  /**
   * Map a DOM position inside the sentence back to an offset in `text`. Each
   * token renders as one element with its start offset on it and a single text
   * node inside, so the offset is just the token's start plus the offset within
   * that node.
   */
  function offsetOf(node: Node | null, offset: number): number | null {
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const el = node.parentElement;
    const start = el?.dataset?.start;
    if (start === undefined) return null;
    return Number(start) + offset;
  }

  function currentSelection(): { start: number; end: number } | null {
    const sel = window.getSelection();
    const root = rootRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) return null;
    const range = sel.getRangeAt(0);
    if (
      !root.contains(range.startContainer) ||
      !root.contains(range.endContainer)
    )
      return null;
    const start = offsetOf(range.startContainer, range.startOffset);
    const end = offsetOf(range.endContainer, range.endOffset);
    if (start === null || end === null || end <= start) return null;
    return { start, end };
  }

  function handleWordClick(start: number, end: number) {
    // A click that ends a drag-select would otherwise toggle the word under the
    // cursor as well; leave those to "Blank selection".
    if (currentSelection()) return;
    onChange(toggleSpan(spans, start, end, text));
  }

  function blankSelection() {
    const range = currentSelection();
    if (!range) return;
    onChange(
      normalizeSpans(
        [...spans, { ...range, text: text.slice(range.start, range.end) }],
        text,
      ),
    );
    window.getSelection()?.removeAllRanges();
    setHasSelection(false);
  }

  if (!text.trim()) {
    return <div className={emptyText}>Write the sentence first.</div>;
  }

  return (
    <div className={wrap}>
      <div
        ref={rootRef}
        className={sentence}
        onMouseUp={() => setHasSelection(currentSelection() !== null)}
        onKeyUp={() => setHasSelection(currentSelection() !== null)}
      >
        {tokens.map((t) => {
          if (!t.word) {
            return (
              <span key={t.start} data-start={t.start}>
                {t.text}
              </span>
            );
          }
          const picked = isCovered(spans, t.start, t.end);
          return (
            <span
              key={t.start}
              data-start={t.start}
              className={picked ? `${word} ${wordPicked}` : word}
              onClick={() => handleWordClick(t.start, t.end)}
            >
              {t.text}
            </span>
          );
        })}
      </div>

      <div className={toolbar}>
        <button
          type="button"
          className={toolBtn}
          disabled={!hasSelection}
          onClick={blankSelection}
        >
          Blank selection
        </button>
        <button
          type="button"
          className={toolBtn}
          disabled={spans.length === 0}
          onClick={() => onChange([])}
        >
          Clear
        </button>
        {spans.length > 0 ? (
          <span className={answerPreview}>
            answer: <b>{spansAnswer(spans)}</b>
          </span>
        ) : (
          <span className={hint}>Click the words this card covers</span>
        )}
      </div>
    </div>
  );
}
