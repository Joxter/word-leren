import { useMemo, useState } from "react";
import { css } from "@linaria/core";
import { rankMatches } from "../lib/search";

const wrap = css`
  position: relative;
`;

const input = css`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.6rem;
  border: 1px dashed #ccc;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-style: solid;
    border-color: #999;
  }
`;

// An overlay rather than an in-flow list, so the rows underneath don't jump as
// you type. Callers are expected to place the picker where there is room below
// it — at the top of its column, not the bottom of a scrolling form.
const results = css`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 5;
  margin-top: 0.25rem;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  max-height: 220px;
  overflow-y: auto;
`;

/**
 * One row of the dropdown, exported so a `footer` section can look like the
 * matches above it rather than reinvent them.
 */
export const pickerRow = css`
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid #f2f2f2;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #f5f5f5;
  }

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }

  &:disabled:hover {
    background: none;
  }

  small {
    color: #888;
    margin-left: 0.4rem;
  }
`;

/** A line of prose in the dropdown — "nothing matched", "still loading". */
export const pickerNote = css`
  padding: 0.45rem 0.6rem;
  font-size: 0.8rem;
  color: #999;
`;

interface Props<T extends { id: string }> {
  /** Everything searchable. Filtering is in memory — these lists are small. */
  items: T[];
  /** Ids to leave out, e.g. things already attached. */
  exclude: Set<string>;
  /**
   * The texts of an item the query is matched against, **most important
   * first** — see `rankMatches` for what that ordering buys.
   */
  fields: (item: T) => (string | undefined)[];
  /** One row of the dropdown. */
  renderItem: (item: T) => React.ReactNode;
  placeholder: string;
  onPick: (item: T) => void;
  limit?: number;
  className?: string;
  /**
   * A second section under the matches: what is typed, a way to clear the box
   * once it has picked something, and how many matches it is sitting under —
   * enough to tell "nothing anywhere" from "nothing else". Having a footer at
   * all opens the dropdown on a query that matches nothing here, so the footer
   * is expected to say so itself rather than leave an empty panel.
   */
  footer?: (
    query: string,
    ctx: { clear: () => void; matches: number },
  ) => React.ReactNode;
}

/**
 * A search box that drops down matching items and hands the chosen one back.
 * Nothing shows until something is typed, so the list stays out of the way.
 * Results are ranked, not merely filtered: the best few are all that fit under
 * `limit`, so the one you meant has to be among them.
 */
export default function SearchPicker<T extends { id: string }>({
  items,
  exclude,
  fields,
  renderItem,
  placeholder,
  onPick,
  limit = 8,
  className,
  footer,
}: Props<T>) {
  const [query, setQuery] = useState("");

  // `fields` is deliberately not a dependency: every call site passes a fresh
  // inline lambda that closes over nothing, so listing it would rebuild the
  // list on every render of the parent.
  const matches = useMemo(
    () =>
      rankMatches(
        items.filter((item) => !exclude.has(item.id)),
        query,
        { fields, label: (item) => fields(item)[0] ?? "", limit },
      ),
    [query, items, exclude, limit],
  );

  const extra = footer?.(query, {
    clear: () => setQuery(""),
    matches: matches.length,
  });
  const open = matches.length > 0 || (extra != null && query.trim() !== "");

  return (
    <div className={className ? `${wrap} ${className}` : wrap}>
      <input
        className={input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <div className={results}>
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              className={pickerRow}
              onClick={() => {
                onPick(item);
                setQuery("");
              }}
            >
              {renderItem(item)}
            </button>
          ))}
          {extra}
        </div>
      )}
    </div>
  );
}
