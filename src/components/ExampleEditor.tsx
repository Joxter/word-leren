import { useEffect, useMemo, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import {
  anchorSpans,
  createExampleLink,
  deleteExample,
  exampleUpdateOps,
  saveLinkSpans,
  spansAnswer,
  toExampleData,
  unlinkExample,
  type Example,
  type ExampleData,
  type ExampleLink,
} from "../lib/examples";
import CardPicker from "./CardPicker";
import MarkdocField from "./MarkdocField";
import SpanBoard from "./SpanBoard";
import { Textarea } from "./Textarea";

const A_LANGS = ["NL", "EN"] as const;
const B_LANGS = ["EN", "RU"] as const;

const panel = css`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const head = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
`;

const label = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const savedNote = css`
  font-size: 0.7rem;
  color: #aaa;
`;

const fieldGroup = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const langRow = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`;

const segmented = css`
  display: inline-flex;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
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

const textarea = css`
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  line-height: 1.5;
  min-height: 3.2rem;

  &:focus {
    outline: none;
    border-color: #999;
  }
`;

const cardList = css`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const cardRow = css`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  background: #fff;
  padding: 0.35rem 0.5rem;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;

  &:hover {
    border-color: #bbb;
  }
`;

/** The row a click on the sentence assigns its blanks to. */
const cardRowActive = css`
  border-color: #d9a300;
  background: #fffbeb;
`;

/** The other end of the hover pairing with the sentence below. */
const cardRowHot = css`
  outline: 2px solid #1a1a1a;
  outline-offset: -1px;
`;

const cardName = css`
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  small {
    font-weight: 400;
    color: #888;
    margin-left: 0.4rem;
  }
`;

const cardSpans = css`
  margin-left: auto;
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
`;

const cardSpansEmpty = css`
  margin-left: auto;
  font-size: 0.75rem;
  color: #b45309;
  white-space: nowrap;
`;

const detachBtn = css`
  background: none;
  border: none;
  color: #dc2626;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0 0.1rem;
  flex-shrink: 0;

  &:hover {
    color: #b91c1c;
  }
`;

const warning = css`
  font-size: 0.75rem;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 0.25rem 0.45rem;
`;

const noLinks = css`
  font-size: 0.8rem;
  color: #999;
  font-style: italic;
`;

const footer = css`
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #f0f0f0;
  padding-top: 0.6rem;
`;

const deleteBtn = css`
  background: none;
  border: none;
  color: #dc2626;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.2rem 0;

  &:hover {
    color: #b91c1c;
  }
`;

const SAVE_DELAY = 600;

interface Props {
  /** Keyed by id by the caller, so switching examples remounts with fresh state. */
  example: Example;
  onDeleted: () => void;
}

/**
 * Edits one example in place: its text, its translation, its note, and which
 * cards claim which fragments of it. There is no Save — the text fields are
 * written after a pause and every link change goes out at once, so the list on
 * the left tracks what is being typed.
 */
export default function ExampleEditor({ example, onDeleted }: Props) {
  const [form, setForm] = useState<ExampleData>(() => toExampleData(example));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string[]>([]);

  const links = (example.links ?? []).filter(
    (l): l is ExampleLink & { card: NonNullable<ExampleLink["card"]> } =>
      !!l.card,
  );

  // Fall back to the first row rather than storing it, so a link deleted from
  // under us (or added by the picker) doesn't leave the board pointing at
  // nothing.
  const active = links.find((l) => l.id === activeId) ?? links[0];
  const activeLinkId = active?.id ?? null;

  // A fresh Set on every render would re-filter the whole card table inside
  // SearchPicker's memo each time the pointer moves over the sentence.
  const attachedIds = useMemo(
    () => new Set(links.map((l) => l.card.id)),
    [links],
  );

  // Spans as they read against the sentence *currently in the form*, which may
  // be a keystroke ahead of what is stored.
  const anchored = links.map((l) => ({
    link: l,
    ...anchorSpans(form.aText, l.spans ?? []),
  }));
  const broken = anchored.flatMap((a) => a.broken);

  // Held back until the typing pauses; the re-anchoring that has to ride along
  // with a changed sentence is `exampleUpdateOps`' business, not the panel's.
  useEffect(() => {
    const ops = exampleUpdateOps(example, form);
    if (ops.length === 0) return;
    const timer = setTimeout(() => db.transact(ops), SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [form, example]);

  function set(field: keyof ExampleData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Every word the pointer crosses reports who owns it, which is a fresh array
   * each time — compare by content so moving along a plain stretch of the
   * sentence doesn't re-render on every token.
   */
  function handleHover(ids: string[]) {
    setHovered((prev) => (prev.join() === ids.join() ? prev : ids));
  }

  async function handleDelete() {
    if (!confirm("Delete this example and detach it from every card?")) return;
    await deleteExample(example.id);
    onDeleted();
  }

  return (
    <div className={panel}>
      <div className={fieldGroup}>
        <div className={langRow}>
          {/* Plain text, not Markdoc: span offsets index into this string, and
              markup would put them out of step with what the sentence reads. */}
          <span className={label}>Sentence</span>
          <div className={segmented}>
            {A_LANGS.map((l) => (
              <div key={l} className={segmentedItem}>
                <input
                  type="radio"
                  id={`ed-aLang-${l}`}
                  name="ed-aLang"
                  value={l}
                  checked={form.aLang === l}
                  onChange={() => set("aLang", l)}
                />
                <label htmlFor={`ed-aLang-${l}`}>{l}</label>
              </div>
            ))}
          </div>
        </div>
        <Textarea
          className={textarea}
          value={form.aText}
          onChange={(e) => set("aText", e.target.value)}
          placeholder="Ik sta elke dag om 7 uur op."
        />
      </div>

      <div className={fieldGroup}>
        <div className={langRow}>
          <span className={label}>Translation</span>
          <div className={segmented}>
            {B_LANGS.map((l) => (
              <div key={l} className={segmentedItem}>
                <input
                  type="radio"
                  id={`ed-bLang-${l}`}
                  name="ed-bLang"
                  value={l}
                  checked={form.bLang === l}
                  onChange={() => set("bLang", l)}
                />
                <label htmlFor={`ed-bLang-${l}`}>{l}</label>
              </div>
            ))}
          </div>
        </div>
        <Textarea
          className={textarea}
          value={form.bText}
          onChange={(e) => set("bText", e.target.value)}
          placeholder="I get up at 7 every day."
        />
      </div>

      <div className={head}>
        <span className={label}>Cards</span>
        <span className={savedNote}>saved as you type</span>
      </div>

      {/* Search first, so its dropdown never has to open near the bottom of
          the column. */}
      <CardPicker
        exclude={attachedIds}
        onPick={(card) => setActiveId(createExampleLink(example.id, card.id))}
      />

      {links.length === 0 ? (
        <div className={noLinks}>
          Not attached to any card yet — it won't show up in learning.
        </div>
      ) : (
        <div className={cardList}>
          {anchored.map(({ link, spans }) => {
            const classes = [cardRow];
            if (link.id === activeLinkId) classes.push(cardRowActive);
            if (hovered.includes(link.id)) classes.push(cardRowHot);
            return (
              <div
                key={link.id}
                className={classes.join(" ")}
                onClick={() => setActiveId(link.id)}
                onMouseEnter={() => handleHover([link.id])}
                onMouseLeave={() => handleHover([])}
              >
                <span className={cardName}>
                  {link.card.aCard}
                  <small>{link.card.bCard}</small>
                </span>
                <span className={spans.length ? cardSpans : cardSpansEmpty}>
                  {spans.length ? spansAnswer(spans) : "no words picked"}
                </span>
                <button
                  type="button"
                  className={detachBtn}
                  title="Detach this card"
                  onClick={(e) => {
                    e.stopPropagation();
                    unlinkExample(link.id);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {broken.length > 0 && (
        <div className={warning}>
          No longer in the sentence:{" "}
          {broken.map((s) => `“${s.text}”`).join(", ")} —{" "}
          {broken.length === 1 ? "it has" : "they have"} been dropped.
        </div>
      )}

      <SpanBoard
        text={form.aText}
        links={anchored.map((a) => ({ id: a.link.id, spans: a.spans }))}
        activeId={activeLinkId}
        hovered={hovered}
        onHover={handleHover}
        onChange={(spans) =>
          activeLinkId && saveLinkSpans(example, form, activeLinkId, spans)
        }
      />

      {/* Last, under the linking board — the note is the least-used field here. */}
      <MarkdocField
        label="Note"
        value={form.note}
        onChange={(v) => set("note", v)}
      />

      <div className={footer}>
        <button type="button" className={deleteBtn} onClick={handleDelete}>
          Delete example
        </button>
      </div>
    </div>
  );
}
