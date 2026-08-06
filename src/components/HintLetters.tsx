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
}: Props) {
  const lines = text.split("\n");

  function isHidden(charIndex: number): boolean {
    if (!hidden) return true;
    return hidden.some((h) => charIndex >= h.start && charIndex < h.end);
  }

  let index = 0;

  return (
    <div className={linesWrap}>
      {lines.map((line, li) => {
        const words = line.split(/(\s+)/).filter((w) => w.length > 0);
        return (
          <div key={li} className={lineRow}>
            {words.map((word, wi) => {
              if (/^\s+$/.test(word)) {
                index += word.length;
                return null;
              }
              // Consecutive shown characters merge into one part rather than
              // staying one per character: a whole word left visible by
              // `hidden` has to read as a word, not as spaced-out letters.
              const parts: { text: string; at: number; box: boolean }[] = [];
              for (const ch of word) {
                const charIndex = index++;
                const boxed = isHidden(charIndex) && HIDDEN_CHAR.test(ch);
                const last = parts[parts.length - 1];
                if (!boxed && last && !last.box) last.text += ch;
                else parts.push({ text: ch, at: charIndex, box: boxed });
              }

              return (
                <div key={wi} className={wordGroup}>
                  {parts.map((part) => {
                    if (!part.box) {
                      return (
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
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
