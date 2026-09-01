import { useState } from "react";
import { createPortal } from "react-dom";
import { css } from "@linaria/core";
import { id } from "@instantdb/react";
import {
  anchorSpans,
  deleteExample,
  emptyExample,
  liveLinks,
  saveExampleWithLinks,
  toExampleData,
  type Example,
  type ExampleData,
  type LinkedCard,
  type PendingLink,
  type Span,
} from "../lib/examples";
import CardPicker from "./CardPicker";
import MarkdocField from "./MarkdocField";
import SpanBoard from "./SpanBoard";
import { Textarea } from "./Textarea";

const A_LANGS = ["NL", "EN"] as const;
const B_LANGS = ["EN", "RU"] as const;

const backdrop = css`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Above CardModal, which this can open on top of. */
  z-index: 60;
  padding: 1rem;
`;

const modal = css`
  background: #fff;
  border-radius: 10px;
  width: 100%;
  /* Wide enough for two columns that are each a little narrower than the old
     single one — the sentence stays comfortable to read while the card links
     get a column of their own. */
  max-width: 940px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 10px 25px -5px rgba(0, 0, 0, 0.15);
  overflow: hidden;
`;

const modalHeader = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0;

  h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }
`;

const closeBtn = css`
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #999;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  border-radius: 4px;

  &:hover {
    color: #333;
    background: #f0f0f0;
  }
`;

const formBody = css`
  padding: 1.25rem 1.5rem;
  max-height: 70vh;
  overflow-y: auto;
`;

// Two columns on the desktop, stacked below — the modal is too narrow to split
// on a phone.
const columns = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    gap: 0;
  }
`;

const col = css`
  min-width: 0;
`;

const rightCol = css`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  @media (max-width: 860px) {
    border-top: 1px solid #f0f0f0;
    padding-top: 1rem;
  }
`;

const fieldGroup = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
`;

const label = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

// Held deliberately darker than the modal: each row is a separate exercise,
// and the white sentence box inside the picker needs something to sit against.
const linkRow = css`
  border: 1px solid #cfcfcf;
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
  background: #eeeeee;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const linkHead = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
`;

const cardName = css`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1a1a1a;

  small {
    font-weight: 400;
    color: #888;
    margin-left: 0.4rem;
  }
`;

const removeBtn = css`
  background: none;
  border: none;
  color: #dc2626;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
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
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
`;

const actions = css`
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
`;

const cancelBtn = css`
  background: none;
  border: 1px solid #e0e0e0;
  padding: 0.45rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  color: #444;

  &:hover {
    background: #f5f5f5;
  }
`;

const saveBtn = css`
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.45rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;

  &:hover {
    background: #333;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const deleteBtn = css`
  background: none;
  border: none;
  color: #dc2626;
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0.45rem 0;

  &:hover {
    color: #b91c1c;
  }
`;

interface Props {
  /** The example to edit, or null to create a new one. */
  example: Example | null;
  /** When opened from a card, that card gets a link row seeded for it. */
  card?: LinkedCard;
  onClose: () => void;
  onSaved?: (exampleId: string) => void;
}

/**
 * Create or edit an example together with all of its card links. The example's
 * text and every link's blanks are saved in one transaction, so the offsets a
 * link stores are always the ones that match the sentence as written.
 */
export default function ExampleModal({
  example,
  card,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<ExampleData>(() =>
    example
      ? toExampleData(example)
      : emptyExample(card?.aLang ?? "NL", card?.bLang ?? "EN"),
  );
  const [links, setLinks] = useState<PendingLink[]>(() => {
    const existing: PendingLink[] = liveLinks(example)
      .filter((l) => l.card)
      .map((l) => ({
        id: l.id,
        card: l.card!,
        spans: l.spans ?? [],
        existing: true,
      }));
    if (card && !existing.some((l) => l.card.id === card.id)) {
      existing.push({ id: id(), card, spans: [], existing: false });
    }
    return existing;
  });
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function set(field: keyof ExampleData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setSpans(linkId: string, spans: Span[]) {
    setLinks((prev) =>
      prev.map((l) => (l.id === linkId ? { ...l, spans } : l)),
    );
  }

  function removeLink(link: PendingLink) {
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    if (link.existing) setRemoved((prev) => [...prev, link.id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.aText.trim()) return;
    setSaving(true);
    try {
      const exampleId = await saveExampleWithLinks(
        example?.id ?? null,
        form,
        links,
        removed,
      );
      onSaved?.(exampleId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!example) return;
    if (!confirm("Delete this example and detach it from every card?")) return;
    await deleteExample(example.id);
    onClose();
  }

  const linkedCardIds = new Set(links.map((l) => l.card.id));

  return createPortal(
    <div className={backdrop} onClick={onClose}>
      <div className={modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalHeader}>
          <h2>{example ? "Edit example" : "New example"}</h2>
          <button type="button" className={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={formBody}>
            <div className={columns}>
              <div className={col}>
                <div className={fieldGroup}>
                  <div className={langRow}>
                    {/* Plain text, not Markdoc: span offsets index into this
                    string, and markup would put them out of step with what
                    the sentence actually reads. */}
                    <span className={label}>Sentence</span>
                    <div className={segmented}>
                      {A_LANGS.map((l) => (
                        <div key={l} className={segmentedItem}>
                          <input
                            type="radio"
                            id={`ex-aLang-${l}`}
                            name="ex-aLang"
                            value={l}
                            checked={form.aLang === l}
                            onChange={() => set("aLang", l)}
                          />
                          <label htmlFor={`ex-aLang-${l}`}>{l}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    className={textarea}
                    value={form.aText}
                    onChange={(e) => set("aText", e.target.value)}
                    placeholder="Ik sta elke dag om 7 uur op."
                    autoFocus
                    required
                  />
                </div>

                <div className={fieldGroup}>
                  <div className={langRow}>
                    <span className={label}>Translation (optional)</span>
                    <div className={segmented}>
                      {B_LANGS.map((l) => (
                        <div key={l} className={segmentedItem}>
                          <input
                            type="radio"
                            id={`ex-bLang-${l}`}
                            name="ex-bLang"
                            value={l}
                            checked={form.bLang === l}
                            onChange={() => set("bLang", l)}
                          />
                          <label htmlFor={`ex-bLang-${l}`}>{l}</label>
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

                <MarkdocField
                  label="Note"
                  value={form.note}
                  onChange={(v) => set("note", v)}
                />
              </div>

              <div className={rightCol}>
                <span className={label}>Cards</span>
                {/* Search first, so its results never have to open near the
                  bottom of the screen. */}
                <CardPicker
                  exclude={linkedCardIds}
                  onPick={(picked) =>
                    setLinks((prev) => [
                      ...prev,
                      { id: id(), card: picked, spans: [], existing: false },
                    ])
                  }
                />
                {links.length === 0 && (
                  <div className={noLinks}>
                    Not attached to any card yet — it won't show up in learning.
                  </div>
                )}
                {links.map((link) => {
                  // Re-anchored live against the sentence as it currently reads,
                  // so editing the text above keeps the blanks in the right place
                  // and surfaces the ones it broke.
                  const anchored = anchorSpans(form.aText, link.spans);
                  return (
                    <div key={link.id} className={linkRow}>
                      <div className={linkHead}>
                        <span className={cardName}>
                          {link.card.aCard}
                          <small>{link.card.bCard}</small>
                        </span>
                        <button
                          type="button"
                          className={removeBtn}
                          onClick={() => removeLink(link)}
                        >
                          Detach
                        </button>
                      </div>
                      {anchored.broken.length > 0 && (
                        <div className={warning}>
                          No longer in the sentence:{" "}
                          {anchored.broken.map((s) => `“${s.text}”`).join(", ")}{" "}
                          — saving will drop{" "}
                          {anchored.broken.length === 1 ? "it" : "them"}.
                        </div>
                      )}
                      {/* One card per row here, so the board carries a single
                          link and there is no pairing to highlight. */}
                      <SpanBoard
                        text={form.aText}
                        links={[{ id: link.id, spans: anchored.spans }]}
                        activeId={link.id}
                        onChange={(spans) => setSpans(link.id, spans)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={footer}>
            {example ? (
              <button
                type="button"
                className={deleteBtn}
                onClick={handleDelete}
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className={actions}>
              <button type="button" className={cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className={saveBtn}
                disabled={saving || !form.aText.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
