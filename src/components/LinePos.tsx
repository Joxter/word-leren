import { css } from "@linaria/core";
import type { LinePosition } from "../lib/queue";

const tag = css`
  display: inline-flex;
  align-items: baseline;
  gap: 0.2rem;
  font-size: 0.7rem;
  color: #666;
  background: #f2f2f2;
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  b {
    font-weight: 400;
    color: #999;
  }
`;

const none = css`
  font-size: 0.7rem;
  color: #bbb;
  white-space: nowrap;
`;

const wrap = css`
  display: inline-flex;
  gap: 0.25rem;
  flex-shrink: 0;
`;

interface Props {
  /** The card's place in each line it is in — `useLinePositions` keyed by id. */
  positions: LinePosition[] | undefined;
  className?: string;
}

/**
 * Where a card stands in the learning line, as "#12". A card in more than one
 * line gets one badge per line, each named — with a single line (the usual
 * case) the name would be the same word on every row and is left off.
 */
export default function LinePos({ positions, className }: Props) {
  const classes = className ? `${wrap} ${className}` : wrap;
  if (!positions || positions.length === 0) {
    return <span className={`${classes} ${none}`}>not in line</span>;
  }
  return (
    <span className={classes}>
      {positions.map((p) => (
        <span
          key={p.lineId}
          className={tag}
          title={`${p.name}: ${p.position} of ${p.size}`}
        >
          {positions.length > 1 && <b>{p.name}</b>}#{p.position}
        </span>
      ))}
    </span>
  );
}
