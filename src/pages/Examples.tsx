import { useMemo, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import ExampleEditor from "../components/ExampleEditor";
import ExampleText from "../components/ExampleText";
import { Textarea } from "../components/Textarea";
import { createExample, type Example } from "../lib/examples";
import { mine } from "../lib/session";

const A_LANGS = ["NL", "EN"] as const;

const page = css`
  max-width: 1500px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 460px);
  gap: 1.5rem;
  align-items: start;

  /* The two columns only pay off on a wide screen; below that the editor goes
     back under the list. */
  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
`;

const leftCol = css`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const rightCol = css`
  min-width: 0;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  background: #fff;
  padding: 1rem;
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;

  @media (max-width: 1080px) {
    position: static;
    max-height: none;
  }
`;

const header = css`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }
`;

const count = css`
  font-size: 0.8rem;
  color: #999;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
`;

const search = css`
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.7rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  line-height: 1.5;
  min-height: 2.4rem;

  &:focus {
    outline: none;
    border-color: #999;
  }
`;

const controls = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
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

const linkBtn = css`
  background: none;
  border: none;
  padding: 0;
  font-size: 0.85rem;
  font-family: inherit;
  color: #2563eb;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const addBox = css`
  border: 1px dashed #c8c8c8;
  border-radius: 10px;
  background: #fafafa;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const addHead = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;

  span {
    font-size: 0.75rem;
    font-weight: 600;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`;

// What the Add button would create, so the box isn't a bare button.
const addPreview = css`
  font-size: 0.875rem;
  line-height: 1.5;
  color: #333;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const addActions = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.2rem;
`;

const addBtn = css`
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;

  &:hover {
    background: #333;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const segmented = css`
  display: inline-flex;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
  margin-left: auto;
`;

const segmentedItem = css`
  position: relative;

  input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  label {
    display: block;
    text-align: center;
    padding: 0.25rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: #aaa;
    border-right: 1px solid #e8e8e8;
    user-select: none;
  }

  &:last-child label {
    border-right: none;
  }

  input[type="radio"]:checked + label {
    background: #ebebeb;
    color: #333;
  }

  &:hover label {
    background: #f5f5f5;
  }
`;

const table = css`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  th {
    text-align: left;
    font-size: 0.7rem;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 0.6rem 0.35rem;
    border-bottom: 1px solid #e5e5e5;
  }

  td {
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: top;
    font-size: 0.9rem;
  }
`;

const bodyRow = css`
  cursor: pointer;

  &:hover td {
    background: #f7f7f7;
  }
`;

const bodyRowActive = css`
  td {
    background: #f0f4ff;
  }

  td:first-child {
    box-shadow: inset 3px 0 0 #2563eb;
  }

  &:hover td {
    background: #e8eefc;
  }
`;

/** Attached to nothing, or attached with no fragments picked — same as the filter. */
const bodyRowLoose = css`
  td:first-child {
    box-shadow: inset 3px 0 0 #fbbf24;
  }
`;

const translationCell = css`
  color: #777;
`;

const noTranslation = css`
  color: #ccc;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 3rem 0;
  font-size: 0.875rem;
`;

const placeholder = css`
  color: #aaa;
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
`;

/** Attached to nothing, or attached with no fragments picked yet. */
function needsWork(e: Example): boolean {
  const links = e.links ?? [];
  return links.length === 0 || links.some((l) => !l.spans?.length);
}

/**
 * Every example sentence, as a table of sentence and translation with the
 * linked fragments highlighted, next to an editor for whichever row is
 * selected. The search box doubles as the way in: type, and when nothing
 * matches it offers what was typed as a new example — whole, exactly as it
 * stands, since only the writer knows where one example ends.
 */
export default function Examples() {
  const [query, setQuery] = useState("");
  const [onlyLoose, setOnlyLoose] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The query for which the add form was opened by hand, even though it matched.
  const [addFor, setAddFor] = useState<string | null>(null);
  const [newLang, setNewLang] = useState<string>("NL");
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = db.useQuery({
    examples: {
      links: { card: {} },
      $: { where: mine(), limit: 2000, order: { createdAt: "desc" } },
    },
  });

  const examples = (data?.examples ?? []) as Example[];
  const selected = examples.find((e) => e.id === selectedId) ?? null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return examples.filter((e) => {
      if (onlyLoose && !needsWork(e)) return false;
      if (!q) return true;
      return (
        e.aText.toLowerCase().includes(q) ||
        (e.bText ?? "").toLowerCase().includes(q) ||
        (e.links ?? []).some(
          (l) =>
            l.card?.aCard.toLowerCase().includes(q) ||
            l.card?.bCard.toLowerCase().includes(q),
        )
      );
    });
  }, [examples, query, onlyLoose]);

  // What goes in if Add is pressed: the box as written, minus the whitespace
  // around it. Line breaks and full stops inside it are the author's business.
  const text = query.trim();
  // Nothing matched, so what was typed was probably not a search at all.
  const showAdd = text !== "" && (shown.length === 0 || addFor === query);

  async function add() {
    if (text === "") return;
    setAdding(true);
    try {
      const newId = await createExample(text, newLang, "EN");
      setQuery("");
      setSelectedId(newId);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={page}>
      <div className={leftCol}>
        <div className={header}>
          <h1>Examples</h1>
          <span className={count}>
            {shown.length}
            {shown.length !== examples.length && ` / ${examples.length}`}
          </span>
        </div>

        <Textarea
          className={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={1}
          placeholder="Search sentences, translations or attached cards — or type a new sentence to add it…"
        />

        <div className={controls}>
          <label
            className={toggle}
            title="Not attached to a card, or attached with no words picked"
          >
            <input
              type="checkbox"
              checked={onlyLoose}
              onChange={() => setOnlyLoose((v) => !v)}
            />
            Needs work
          </label>
          {query.trim() !== "" && !showAdd && (
            <button
              type="button"
              className={linkBtn}
              onClick={() => setAddFor(query)}
            >
              Add as new instead
            </button>
          )}
        </div>

        {showAdd && (
          <div className={addBox}>
            <div className={addHead}>
              <span>New sentence</span>
              <div className={segmented}>
                {A_LANGS.map((l) => (
                  <div key={l} className={segmentedItem}>
                    <input
                      type="radio"
                      id={`new-aLang-${l}`}
                      name="new-aLang"
                      value={l}
                      checked={newLang === l}
                      onChange={() => setNewLang(l)}
                    />
                    <label htmlFor={`new-aLang-${l}`}>{l}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* Edits go in the box above — this only shows what will be
                stored, whitespace already off both ends. */}
            <div className={addPreview}>{text}</div>

            <div className={addActions}>
              <button
                type="button"
                className={addBtn}
                onClick={add}
                disabled={adding}
              >
                {adding ? "Adding…" : "Add example"}
              </button>
              <button
                type="button"
                className={linkBtn}
                onClick={() => setQuery("")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!isLoading && examples.length === 0 && (
          <div className={empty}>
            No examples yet. Type a sentence above to add one.
          </div>
        )}

        {shown.length > 0 && (
          <table className={table}>
            <thead>
              <tr>
                {/* Fixed halves, so the split doesn't shift as the sentences
                    and translations change length. */}
                <th style={{ width: "50%" }}>Sentence</th>
                <th style={{ width: "50%" }}>Translation</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                // Every card's fragments at once — the editor is where they are
                // split back apart per card.
                const spans = (e.links ?? []).flatMap((l) => l.spans ?? []);
                const classes = [bodyRow];
                if (e.id === selectedId) classes.push(bodyRowActive);
                else if (needsWork(e)) classes.push(bodyRowLoose);
                return (
                  <tr
                    key={e.id}
                    className={classes.join(" ")}
                    onClick={() => setSelectedId(e.id)}
                  >
                    <td>
                      <ExampleText text={e.aText} spans={spans} />
                    </td>
                    <td className={translationCell}>
                      {e.bText?.trim() || (
                        <span className={noTranslation}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!isLoading &&
          examples.length > 0 &&
          shown.length === 0 &&
          !showAdd && <div className={empty}>Nothing matches.</div>}
      </div>

      <div className={rightCol}>
        {selected ? (
          <ExampleEditor
            key={selected.id}
            example={selected}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div className={placeholder}>
            Pick a sentence on the left to translate it, note it, and choose
            which cards it belongs to.
          </div>
        )}
      </div>
    </div>
  );
}
