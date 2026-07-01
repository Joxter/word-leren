import { css } from "@linaria/core";
import type { Line } from "../lib/lines";

const wrap = css`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
`;

const select = css`
  appearance: none;
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 0.4rem 1.8rem 0.4rem 0.7rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1a1a1a;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23888' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.65rem center;

  &:hover {
    border-color: #1a1a1a;
  }
`;

interface Props {
  lines: Line[];
  value: string | null;
  onChange: (lineId: string) => void;
}

export default function LineSelector({ lines, value, onChange }: Props) {
  return (
    <div className={wrap}>
      <select
        className={select}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {lines.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
