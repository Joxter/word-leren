import { useMemo, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import {
  unlinkExample,
  type Example,
  type ExampleLink,
  type LinkedCard,
} from "../lib/examples";
import ExampleModal from "./ExampleModal";
import ExampleText from "./ExampleText";

const section = css`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 1rem;
`;

const label = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const row = css`
  border: 1px solid #ececec;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
`;

const rowBody = css`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.875rem;
`;

const translation = css`
  font-size: 0.8rem;
  color: #888;
`;

const noSpans = css`
  font-size: 0.75rem;
  color: #b45309;
`;

const rowActions = css`
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
`;

const smallBtn = css`
  background: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #333;
  cursor: pointer;

  &:hover {
    background: #e8e8e8;
    border-color: #1a1a1a;
  }
`;

const dangerBtn = css`
  background: none;
  border: 1px solid #f0d0d0;
  border-radius: 5px;
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  color: #dc2626;
  cursor: pointer;

  &:hover {
    background: #fef2f2;
    border-color: #dc2626;
  }
`;

const emptyText = css`
  font-size: 0.8rem;
  color: #aaa;
  font-style: italic;
`;

const addRow = css`
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
`;

const newBtn = css`
  background: #fff;
  border: 1px dashed #ccc;
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  font-size: 0.85rem;
  color: #444;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    border-color: #999;
    border-style: solid;
  }
`;

const searchWrap = css`
  position: relative;
  flex: 1;
  min-width: 0;
`;

const searchInput = css`
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

const resultItem = css`
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
`;

/** Search box that attaches an example that already exists. */
function ExamplePicker({
  exclude,
  onPick,
}: {
  exclude: Set<string>;
  onPick: (example: Example) => void;
}) {
  const [query, setQuery] = useState("");
  // Links come along so the editor opened from here knows about every card the
  // example is already attached to.
  const { data } = db.useQuery({
    examples: { links: { card: {} }, $: { limit: 2000 } },
  });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const examples = (data?.examples ?? []) as Example[];
    return examples
      .filter(
        (e) =>
          !exclude.has(e.id) &&
          (e.aText.toLowerCase().includes(q) ||
            (e.bText ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, data, exclude]);

  return (
    <div className={searchWrap}>
      <input
        className={searchInput}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Attach an existing example…"
        autoComplete="off"
      />
      {matches.length > 0 && (
        <div className={results}>
          {matches.map((e) => (
            <button
              key={e.id}
              type="button"
              className={resultItem}
              onClick={() => {
                onPick(e);
                setQuery("");
              }}
            >
              {e.aText}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  card: LinkedCard;
}

/**
 * The examples attached to one card, shown inside the card editor. Unlike the
 * rest of that form, everything here is written straight away — examples and
 * their links are separate entities, so they don't wait on the card's Save.
 */
export default function CardExamples({ card }: Props) {
  // Reached through the card rather than by filtering exampleLinks, so the
  // scoping is a plain id lookup. Each example brings its *other* links along
  // too, so the editor opened from here shows every card the sentence is
  // attached to, not just this one.
  const { data } = db.useQuery({
    cards: {
      $: { where: { id: card.id } },
      exampleLinks: { example: { links: { card: {} } } },
    },
  });
  const links = (data?.cards?.[0]?.exampleLinks ?? []) as ExampleLink[];

  const [editing, setEditing] = useState<Example | null>(null);
  const [creating, setCreating] = useState(false);

  const linkedExampleIds = new Set(
    links.map((l) => l.example?.id).filter((x): x is string => !!x),
  );

  return (
    <div className={section}>
      <span className={label}>Examples</span>

      {links.length === 0 && (
        <span className={emptyText}>No examples attached yet.</span>
      )}

      {links.map((link) => {
        const example = link.example;
        if (!example) return null;
        const spans = link.spans ?? [];
        return (
          <div key={link.id} className={row}>
            <div className={rowBody}>
              <ExampleText text={example.aText} spans={spans} />
              {example.bText?.trim() && (
                <span className={translation}>{example.bText}</span>
              )}
              {spans.length === 0 && (
                <span className={noSpans}>
                  No blanks chosen — pick the words this card covers.
                </span>
              )}
            </div>
            <div className={rowActions}>
              <button
                type="button"
                className={smallBtn}
                onClick={() => setEditing(example)}
              >
                Edit
              </button>
              <button
                type="button"
                className={dangerBtn}
                onClick={() => unlinkExample(link.id)}
              >
                Detach
              </button>
            </div>
          </div>
        );
      })}

      <div className={addRow}>
        <button
          type="button"
          className={newBtn}
          onClick={() => setCreating(true)}
        >
          + New example
        </button>
        {/* Picking an existing example opens the editor with this card seeded
            as a new link, so the blanks get chosen before anything is written
            — an attachment with no blanks isn't a usable exercise. */}
        <ExamplePicker exclude={linkedExampleIds} onPick={setEditing} />
      </div>

      {creating && (
        <ExampleModal
          example={null}
          card={card}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ExampleModal
          example={editing}
          card={card}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
