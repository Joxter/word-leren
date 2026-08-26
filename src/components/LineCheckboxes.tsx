import { css } from "@linaria/core";
import type { Line } from "../lib/lines";

const wrap = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const label = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const options = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const chip = css`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #444;
  cursor: pointer;
  user-select: none;

  input {
    margin: 0;
    cursor: pointer;
  }

  &:hover {
    border-color: #bbb;
  }
`;

const chipOn = css`
  border-color: #1a1a1a;
  background: #f5f5f5;
  color: #1a1a1a;
  font-weight: 600;
`;

const emptyHint = css`
  font-size: 0.8rem;
  color: #aaa;
`;

interface Props {
  lines: Line[];
  selected: Set<string>;
  onToggle: (lineId: string) => void;
}

export default function LineCheckboxes({ lines, selected, onToggle }: Props) {
  return (
    <div className={wrap}>
      <span className={label}>Lines</span>
      {lines.length === 0 ? (
        <span className={emptyHint}>
          No lines yet — create one on the Account page.
        </span>
      ) : (
        <div className={options}>
          {lines.map((l) => {
            const on = selected.has(l.id);
            return (
              <label key={l.id} className={on ? `${chip} ${chipOn}` : chip}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(l.id)}
                />
                {l.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
