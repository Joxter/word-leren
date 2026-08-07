import { useRef } from "react";
import { css } from "@linaria/core";
import { useTextSelection } from "../hooks/useTextSelection";
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
  line-height: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
`;

const word = css`
  border-radius: 3px;
  padding: 0.1em 0.15em;
  border-bottom: 1px dashed #d5d5d5;
`;

const clickable = css`
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
`;

/** Covered by the row being edited — the blanks a click here toggles. */
const wordActive = css`
  background: #fff3c4;
  border-bottom: 1px solid #d9a300;

  &:hover {
    background: #ffe89a;
  }
`;

/** Covered by some other card, shown so the sentence's whole load is visible. */
const wordOther = css`
  background: #e8eefc;
  border-bottom: 1px solid #9db4e8;

  &:hover {
    background: #dbe5fa;
  }
`;

/** Either end of the hover pairing: this fragment and its card light up together. */
const wordHot = css`
  outline: 2px solid #1a1a1a;
  outline-offset: -1px;
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

/** One card's claim on the sentence, with its spans already re-anchored. */
export interface BoardLink {
  id: string;
  spans: Span[];
}

interface Props {
  text: string;
  links: BoardLink[];
  /** The link a click assigns to, or null when no card is selected. */
  activeId: string | null;
  /**
   * Link ids to light up; the parent shares this with its card list. Left out
   * where the sentence is shown one card at a time and there is no pairing to
   * make.
   */
  hovered?: string[];
  onHover?: (linkIds: string[]) => void;
  /** New spans for the active link. */
  onChange: (spans: Span[]) => void;
}

const NO_HOVER: string[] = [];

/**
 * The sentence, once, carrying every card's fragments at the same time —
 * clicking a word toggles it for the card currently selected, while the other
 * cards' fragments stay visible in a second colour. Hovering a fragment reports
 * the cards it belongs to so the list can highlight them, and hovering a card
 * over there lights up its fragments here; that pairing is what replaces
 * repeating the whole sentence once per card. Pass a single link and no
 * `hovered`/`onHover` to get the plain one-card picker back.
 */
export default function SpanBoard({
  text,
  links,
  activeId,
  hovered = NO_HOVER,
  onHover = () => {},
  onChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selection = useTextSelection(rootRef);

  const active = links.find((l) => l.id === activeId);
  const spans = active?.spans ?? [];

  function handleWordClick(start: number, end: number) {
    if (!active) return;
    // A click that ends a drag-select would otherwise toggle the word under the
    // cursor as well; leave those to "Blank selection".
    if (selection.current()) return;
    onChange(toggleSpan(spans, start, end, text));
  }

  function blankSelection() {
    const range = selection.current();
    if (!range || !active) return;
    onChange(
      normalizeSpans(
        [...spans, { ...range, text: text.slice(range.start, range.end) }],
        text,
      ),
    );
    selection.clear();
  }

  if (!text.trim()) {
    return <div className={emptyText}>Write the sentence first.</div>;
  }

  return (
    <div className={wrap}>
      <div
        ref={rootRef}
        className={sentence}
        onMouseUp={selection.refresh}
        onKeyUp={selection.refresh}
        onMouseLeave={() => onHover([])}
      >
        {tokenize(text).map((t) => {
          const owners = links
            .filter((l) => isCovered(l.spans, t.start, t.end))
            .map((l) => l.id);
          // Punctuation and spaces are painted when a phrase span runs through
          // them, but only words are click targets.
          const classes = [word];
          if (owners.includes(activeId ?? "")) classes.push(wordActive);
          else if (owners.length > 0) classes.push(wordOther);
          if (owners.some((o) => hovered.includes(o))) classes.push(wordHot);
          if (t.word && active) classes.push(clickable);

          if (!t.word && owners.length === 0) {
            return (
              <span key={t.start} data-start={t.start}>
                {t.text}
              </span>
            );
          }
          return (
            <span
              key={t.start}
              data-start={t.start}
              className={classes.join(" ")}
              onMouseEnter={() => onHover(owners)}
              onClick={
                t.word ? () => handleWordClick(t.start, t.end) : undefined
              }
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
          disabled={!selection.hasSelection || !active}
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
        {!active ? (
          <span className={hint}>Attach a card first, then pick its words</span>
        ) : spans.length > 0 ? (
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
