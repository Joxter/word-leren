import { css } from "@linaria/core";

const linesWrap = css`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const lineRow = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
`;

const wordGroup = css`
  display: flex;
  gap: 0.2rem;
  margin-right: 0.6rem;
  margin-bottom: 0.2rem;
`;

// Inline layout: the boxes sit inside a sentence that still has to read as a
// sentence, so the text around them keeps whatever type it was rendered with
// and only the boxed words get a group of their own.
const inlineWrap = css`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const inlineGroup = css`
  display: inline-flex;
  gap: 0.2rem;
  margin: 0 0.1rem;
  vertical-align: middle;
`;

const box = css`
  width: 1.6rem;
  height: 1.9rem;
  border: 1px solid #d5d5d5;
  border-radius: 5px;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #1a1a1a;
  cursor: pointer;
  padding: 0;

  &:hover {
    border-color: #1a1a1a;
    background: #f0f0f0;
  }
`;

const boxRevealed = css`
  cursor: default;
  background: #fff;

  &:hover {
    border-color: #d5d5d5;
    background: #fff;
  }
`;

const plainChar = css`
  font-size: 1.1rem;
  font-weight: 600;
  color: #1a1a1a;
  padding: 0 0.1rem;
`;

const HIDDEN_CHAR = /[\p{L}\p{N}]/u;

interface Props {
  text: string;
  revealed: boolean[];
  onReveal: (index: number) => void;
  /**
   * Ranges of `text` to hide, as `{ start, end }` with `end` exclusive.
   * Defaults to the whole string. Anything outside them reads as plain text,
   * which is what turns this into a cloze: the sentence stays legible and only
   * the fragments in `hidden` become boxes.
   */
  hidden?: { start: number; end: number }[];
  /**
   * Render the untouched text as ordinary inline text, inheriting the type of
   * whatever it sits in, instead of as its own block of spaced-out characters.
   * For a cloze prompt, where the sentence itself is what the user reads.
   */
  inline?: boolean;
}

/**
 * One box per letter/digit of the hidden part of `text`, revealed on click.
 * Spaces and punctuation are shown as-is (nothing to guess there). Each
 * character's index is its position in the flattened string, so `revealed`
 * stays valid across re-renders as long as the card doesn't change.
 */
export default function HintLetters({
  text,
  revealed,
  onReveal,
  hidden,
  inline = false,
}: Props) {
  const lines = text.split("\n");

  function isHidden(charIndex: number): boolean {
    if (!hidden) return true;
    return hidden.some((h) => charIndex >= h.start && charIndex < h.end);
  }

  let index = 0;

  function renderWord(word: string, key: number) {
    // Consecutive shown characters merge into one part rather than staying one
    // per character: a whole word left visible by `hidden` has to read as a
    // word, not as spaced-out letters.
    const parts: { text: string; at: number; box: boolean }[] = [];
    for (const ch of word) {
      const charIndex = index++;
      const boxed = isHidden(charIndex) && HIDDEN_CHAR.test(ch);
      const last = parts[parts.length - 1];
      if (!boxed && last && !last.box) last.text += ch;
      else parts.push({ text: ch, at: charIndex, box: boxed });
    }

    // A word with nothing to guess stays a plain run of text, so the sentence
    // around the gaps flows exactly as it did before the hint was opened.
    if (inline && parts.every((p) => !p.box)) {
      return <span key={key}>{word}</span>;
    }

    return (
      <span key={key} className={inline ? inlineGroup : wordGroup}>
        {parts.map((part) => {
          if (!part.box) {
            return inline ? (
              <span key={part.at}>{part.text}</span>
            ) : (
              <span key={part.at} className={plainChar}>
                {part.text}
              </span>
            );
          }
          const isRevealed = revealed[part.at] ?? false;
          return (
            <button
              key={part.at}
              type="button"
              className={isRevealed ? `${box} ${boxRevealed}` : box}
              disabled={isRevealed}
              onClick={() => onReveal(part.at)}
            >
              {isRevealed ? part.text : ""}
            </button>
          );
        })}
      </span>
    );
  }

  function renderLine(line: string, li: number) {
    // The newline `split` consumed is a character of `text` too, so it has to
    // be counted or every index after the first line drifts out of `hidden`.
    if (li > 0) index += 1;
    const words = line.split(/(\s+)/).filter((w) => w.length > 0);
    return words.map((word, wi) => {
      if (/^\s+$/.test(word)) {
        index += word.length;
        // Block layout spaces words itself; inline keeps the real whitespace.
        return inline ? <span key={wi}>{word}</span> : null;
      }
      return renderWord(word, wi);
    });
  }

  if (inline) {
    return (
      <span className={inlineWrap}>
        {lines.map((line, li) => (
          // The wrapper preserves whitespace, so the line break is text here.
          <span key={li}>
            {li > 0 ? "\n" : ""}
            {renderLine(line, li)}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className={linesWrap}>
      {lines.map((line, li) => (
        <div key={li} className={lineRow}>
          {renderLine(line, li)}
        </div>
      ))}
    </div>
  );
}
