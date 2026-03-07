import { useState } from "react";
import { css } from "@linaria/core";
import type { Card, CardData } from "../pages/Cards";

const LANGS = ["EN", "RU", "NL"] as const;

const DEFAULT_FORM: CardData = {
  aLang: "EN",
  bLang: "NL",
  aCard: "",
  bCard: "",
  note: "",
};

const backdrop = css`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
`;

const modal = css`
  background: #fff;
  border-radius: 10px;
  width: 100%;
  max-width: 560px;
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
`;

const sides = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const side = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
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

const select = css`
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;
  background: #fff;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #999;
  }
`;

const textarea = css`
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;
  resize: vertical;
  line-height: 1.4;

  &:focus {
    outline: none;
    border-color: #999;
  }
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
  card?: Card;
  defaultLangs?: { aLang: string; bLang: string };
  onSave: (data: CardData) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function CardModal({
  card,
  defaultLangs,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [form, setForm] = useState<CardData>(
    card
      ? {
          aLang: card.aLang,
          bLang: card.bLang,
          aCard: card.aCard,
          bCard: card.bCard,
          note: card.note ?? "",
        }
      : { ...DEFAULT_FORM, ...defaultLangs },
  );

  function set(field: keyof CardData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className={backdrop} onClick={onClose}>
      <div className={modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalHeader}>
          <h2>{card ? "Edit card" : "New card"}</h2>
          <button className={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={formBody}>
            <div className={sides}>
              <div className={side}>
                <span className={label}>Language A</span>
                <select
                  className={select}
                  value={form.aLang}
                  onChange={(e) => set("aLang", e.target.value)}
                >
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <span className={label}>Word / Phrase</span>
                <textarea
                  className={textarea}
                  value={form.aCard}
                  onChange={(e) => set("aCard", e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <div className={side}>
                <span className={label}>Language B</span>
                <select
                  className={select}
                  value={form.bLang}
                  onChange={(e) => set("bLang", e.target.value)}
                >
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <span className={label}>Translation</span>
                <textarea
                  className={textarea}
                  value={form.bCard}
                  onChange={(e) => set("bCard", e.target.value)}
                  rows={3}
                  required
                />
              </div>
            </div>

            <div className={fieldGroup}>
              <span className={label}>Note</span>
              <textarea
                className={textarea}
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className={footer}>
            {card && (
              <button
                type="button"
                className={deleteBtn}
                onClick={() => onDelete(card.id)}
              >
                Delete
              </button>
            )}
            <div className={actions}>
              <button type="button" className={cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={saveBtn}>
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
