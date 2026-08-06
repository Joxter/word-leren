import { useMemo, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import ExampleModal from "../components/ExampleModal";
import ExampleText from "../components/ExampleText";
import { spansAnswer, type Example } from "../lib/examples";

const page = css`
  max-width: 840px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
`;

const header = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }
`;

const newBtn = css`
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: #333;
  }
`;

const controls = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
`;

const search = css`
  flex: 1;
  min-width: 200px;
  padding: 0.5rem 0.7rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #999;
  }
`;

const toggle = css`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  white-space: nowrap;

  input {
    cursor: pointer;
  }
`;

const count = css`
  font-size: 0.8rem;
  color: #999;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
`;

const list = css`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`;

const row = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  padding: 0.75rem 0.875rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;

  &:hover {
    border-color: #aaa;
  }
`;

const sentence = css`
  font-size: 1rem;
  color: #1a1a1a;
`;

const translation = css`
  font-size: 0.85rem;
  color: #777;
`;

const chips = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.15rem;
`;

const chip = css`
  font-size: 0.7rem;
  font-weight: 600;
  color: #444;
  background: #f2f2f2;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
`;

const chipEmpty = css`
  color: #b45309;
  background: #fef3c7;
`;

const unattached = css`
  font-size: 0.7rem;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  align-self: flex-start;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

/**
 * All example sentences. Each row shows the sentence with every linked
 * fragment highlighted at once — across all its cards — so a sentence that is
 * carrying several exercises reads as such at a glance. Clicking opens the
 * editor, which is where the per-card blanks actually live.
 */
export default function Examples() {
  const [query, setQuery] = useState("");
  const [onlyLoose, setOnlyLoose] = useState(false);
  // One state for both "new" and "edit": the editor is either closed, or open
  // on an example — `null` inside it meaning one that doesn't exist yet.
  const [modal, setModal] = useState<{ example: Example | null } | null>(null);

  const { data, isLoading } = db.useQuery({
    examples: {
      links: { card: {} },
      $: { limit: 2000, order: { createdAt: "desc" } },
    },
  });

  const examples = (data?.examples ?? []) as Example[];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return examples.filter((e) => {
      const links = e.links ?? [];
      // "Needs work" catches both ends of an unfinished example: attached to
      // nothing, or attached with no blanks picked.
      if (onlyLoose && links.length > 0 && links.every((l) => l.spans?.length))
        return false;
      if (!q) return true;
      return (
        e.aText.toLowerCase().includes(q) ||
        (e.bText ?? "").toLowerCase().includes(q) ||
        links.some(
          (l) =>
            l.card?.aCard.toLowerCase().includes(q) ||
            l.card?.bCard.toLowerCase().includes(q),
        )
      );
    });
  }, [examples, query, onlyLoose]);

  return (
    <div className={page}>
      <div className={header}>
        <h1>Examples</h1>
        <button className={newBtn} onClick={() => setModal({ example: null })}>
          New example
        </button>
      </div>

      <div className={controls}>
        <input
          className={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sentences, translations or attached cards…"
        />
        <label
          className={toggle}
          title="Not attached to a card, or attached with no blanks picked"
        >
          <input
            type="checkbox"
            checked={onlyLoose}
            onChange={() => setOnlyLoose((v) => !v)}
          />
          Needs work
        </label>
        <span className={count}>
          {shown.length}
          {shown.length !== examples.length && ` / ${examples.length}`}
        </span>
      </div>

      {!isLoading && examples.length === 0 && (
        <div className={empty}>
          No examples yet. Add one here, or from the Examples section of any
          card.
        </div>
      )}

      {!isLoading && examples.length > 0 && shown.length === 0 && (
        <div className={empty}>Nothing matches.</div>
      )}

      <div className={list}>
        {shown.map((e) => {
          const links = e.links ?? [];
          // Every card's blanks at once — the editor is where they are split
          // back apart per card.
          const allSpans = links.flatMap((l) => l.spans ?? []);
          return (
            <div
              key={e.id}
              className={row}
              onClick={() => setModal({ example: e })}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") setModal({ example: e });
              }}
            >
              <ExampleText
                text={e.aText}
                spans={allSpans}
                className={sentence}
              />
              {e.bText?.trim() && (
                <span className={translation}>{e.bText}</span>
              )}
              {links.length === 0 ? (
                <span className={unattached}>Not attached to a card</span>
              ) : (
                <div className={chips}>
                  {links.map((l) => (
                    <span
                      key={l.id}
                      className={
                        l.spans?.length ? chip : `${chip} ${chipEmpty}`
                      }
                      title={
                        l.spans?.length
                          ? spansAnswer(l.spans)
                          : "No blanks picked"
                      }
                    >
                      {l.card?.aCard ?? "—"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <ExampleModal example={modal.example} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
