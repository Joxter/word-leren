import { css } from "@linaria/core";

const wrap = css`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.75rem;
  user-select: none;
`;

const row = css`
  display: flex;
  gap: 0.25rem;
  justify-content: center;
`;

const key = css`
  flex: 1 1 0;
  min-width: 0;
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 0.7rem 0;
  font-size: 1.05rem;
  font-family: inherit;
  color: #1a1a1a;
  cursor: pointer;
  touch-action: manipulation;

  &:active {
    background: #e0e0e0;
  }

  &:disabled {
    opacity: 0.25;
  }
`;

// Half-key spacers keep the shorter rows visually centered like a phone keyboard.
const halfSpacer = css`
  flex: 0.5 0 0;
`;

// Space and backspace flank the bottom letter row, slightly wider than a letter.
const sideKey = css`
  flex: 1.5 1 0;
  font-size: 0.85rem;
`;

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

interface Props {
  onKey: (ch: string) => void;
  onBackspace: () => void;
  // Hint mode: characters the answer contains; every other key is disabled.
  allowed?: Set<string> | null;
}

export default function VirtualKeyboard({
  onKey,
  onBackspace,
  allowed,
}: Props) {
  const off = (ch: string) => allowed != null && !allowed.has(ch);
  // pointerdown instead of click: fires immediately and, with preventDefault,
  // never moves focus or triggers double-tap zoom on phones.
  const press = (fn: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <div className={wrap}>
      {ROWS.map((letters, i) => {
        const last = i === ROWS.length - 1;
        return (
          <div key={i} className={row}>
            {last ? (
              <button
                className={`${key} ${sideKey}`}
                disabled={off(" ")}
                onPointerDown={press(() => onKey(" "))}
              >
                space
              </button>
            ) : (
              i > 0 && <span className={halfSpacer} />
            )}
            {letters.map((ch) => (
              <button
                key={ch}
                className={key}
                disabled={off(ch)}
                onPointerDown={press(() => onKey(ch))}
              >
                {ch}
              </button>
            ))}
            {last ? (
              <button
                className={`${key} ${sideKey}`}
                onPointerDown={press(onBackspace)}
              >
                ⌫
              </button>
            ) : (
              i > 0 && <span className={halfSpacer} />
            )}
          </div>
        );
      })}
    </div>
  );
}
