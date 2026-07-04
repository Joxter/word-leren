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
}

/**
 * One box per letter/digit of `text`, hiding it until clicked. Spaces and
 * punctuation are shown as-is (nothing to guess there). Each character's index
 * is its position in the flattened string, so `revealed` stays valid across
 * re-renders as long as the card doesn't change.
 */
export default function HintLetters({ text, revealed, onReveal }: Props) {
  const lines = text.split("\n");

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
              return (
                <div key={wi} className={wordGroup}>
                  {[...word].map((ch) => {
                    const charIndex = index++;
                    if (!HIDDEN_CHAR.test(ch)) {
                      return (
                        <span key={charIndex} className={plainChar}>
                          {ch}
                        </span>
                      );
                    }
                    const isRevealed = revealed[charIndex] ?? false;
                    return (
                      <button
                        key={charIndex}
                        type="button"
                        className={isRevealed ? `${box} ${boxRevealed}` : box}
                        disabled={isRevealed}
                        onClick={() => onReveal(charIndex)}
                      >
                        {isRevealed ? ch : ""}
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
