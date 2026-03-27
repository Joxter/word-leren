import { useEffect, useState } from "react";
import { useImagePaste } from "../hooks/useImagePaste";
import { css } from "@linaria/core";
import type { Card, CardData } from "../pages/Cards";
import MarkdocField from "./MarkdocField";

const LANGS = ["EN", "RU", "NL"] as const;


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
  max-height: 70vh;
  overflow-y: auto;
`;

const sides = css`
  display: grid;
  grid-template-columns: 1fr;
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

const segmented = css`
  display: inline-flex;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
  width: 100%;
`;

const segmentedItem = css`
  flex: 1;
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
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    background: #fff;
    color: #666;
    border-right: 1px solid #e0e0e0;
    transition:
      background 0.1s,
      color 0.1s;
    user-select: none;
  }

  &:last-child label {
    border-right: none;
  }

  input[type="radio"]:checked + label {
    background: #1a1a1a;
    color: #fff;
  }

  &:hover label {
    background: #f5f5f5;
  }

  input[type="radio"]:checked + label:hover {
    background: #1a1a1a;
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

const imageRow = css`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
`;

const previewImg = css`
  width: 100px;
  height: 70px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  flex-shrink: 0;
`;

const removeImgBtn = css`
  background: none;
  border: none;
  color: #dc2626;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
  margin-top: 0.25rem;

  &:hover {
    color: #b91c1c;
  }
`;

const addImgLabel = css`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4rem 0.75rem;
  border: 1px dashed #ccc;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #666;
  cursor: pointer;

  &:hover {
    border-color: #999;
    color: #333;
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
  card: Card;
  onSave: (
    formData: CardData,
    imageFile: File | null,
    removeImageId: string | null,
  ) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function CardModal({ card, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<CardData>({
    aLang: card.aLang,
    bLang: card.bLang,
    aCard: card.aCard,
    bCard: card.bCard,
    note: card.note ?? "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setLocalPreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useImagePaste((file) => { setImageFile(file); setImageRemoved(false); });

  const previewUrl =
    localPreview ?? (!imageRemoved ? (card?.image?.url ?? null) : null);

  function set(field: keyof CardData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleRemoveImage() {
    setImageFile(null);
    setImageRemoved(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // if a new file is selected and card already has an image, remove the old one
    const removeImageId =
      imageRemoved || imageFile !== null ? (card?.image?.id ?? null) : null;
    try {
      await onSave(form, imageFile, removeImageId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={backdrop} onClick={onClose}>
      <div className={modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalHeader}>
          <h2>Edit card</h2>
          <button className={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={formBody}>
            <div className={sides}>
              <div className={side}>
                <span className={label}>Language A</span>
                <div className={segmented}>
                  {LANGS.map((l) => (
                    <div key={l} className={segmentedItem}>
                      <input
                        type="radio"
                        id={`aLang-${l}`}
                        name="aLang"
                        value={l}
                        checked={form.aLang === l}
                        onChange={() => set("aLang", l)}
                      />
                      <label htmlFor={`aLang-${l}`}>{l}</label>
                    </div>
                  ))}
                </div>
                <MarkdocField
                  label="Word / Phrase"
                  value={form.aCard}
                  onChange={(v) => set("aCard", v)}
                  rows={3}
                  required
                />
              </div>

              <div className={side}>
                <span className={label}>Language B</span>
                <div className={segmented}>
                  {LANGS.map((l) => (
                    <div key={l} className={segmentedItem}>
                      <input
                        type="radio"
                        id={`bLang-${l}`}
                        name="bLang"
                        value={l}
                        checked={form.bLang === l}
                        onChange={() => set("bLang", l)}
                      />
                      <label htmlFor={`bLang-${l}`}>{l}</label>
                    </div>
                  ))}
                </div>
                <MarkdocField
                  label="Translation"
                  value={form.bCard}
                  onChange={(v) => set("bCard", v)}
                  rows={3}
                  required
                />
              </div>
            </div>

            <MarkdocField
              label="Note"
              value={form.note}
              onChange={(v) => set("note", v)}
              rows={2}
            />

            <div className={fieldGroup}>
              <span className={label}>Image</span>
              {previewUrl ? (
                <div className={imageRow}>
                  <img src={previewUrl} className={previewImg} alt="" />
                  <div>
                    <button
                      type="button"
                      className={removeImgBtn}
                      onClick={handleRemoveImage}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className={addImgLabel}>
                  + Add image
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setImageFile(file);
                        setImageRemoved(false);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className={footer}>
            <button
              type="button"
              className={deleteBtn}
              onClick={() => onDelete(card.id)}
            >
              Delete
            </button>
            <div className={actions}>
              <button type="button" className={cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={saveBtn} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
