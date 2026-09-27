import { css } from "@linaria/core";

const tag = css`
  display: inline-flex;
  align-items: baseline;
  font-size: 0.7rem;
  color: #666;
  background: #f2f2f2;
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  white-space: nowrap;
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
  /** The lines the card is in — `useCardLines` keyed by id. */
  names: string[] | undefined;
  className?: string;
}

/**
 * Which lines a card is in, one badge each. A card in no line is never
 * served, so that is said out loud; with a single line the names are left
 * off (see `useCardLines`) and a member prints nothing.
 */
export default function LineTags({ names, className }: Props) {
  const classes = className ? `${wrap} ${className}` : wrap;
  if (!names) {
    return <span className={`${classes} ${none}`}>not in line</span>;
  }
  if (names.length === 0) return null;
  return (
    <span className={classes}>
      {names.map((n) => (
        <span key={n} className={tag}>
          {n}
        </span>
      ))}
    </span>
  );
}
