import { useEffect, useRef, useState } from "react";
import { css } from "@linaria/core";

export interface LightCardData {
  text: string;
}

export interface LightCard extends LightCardData {
  id: string;
  image?: { id: string; url: string; path: string };
}

interface Props {
  card?: LightCard;
  onSave: (
    data: LightCardData,
    imageFile: File | null,
    removeImageId: string | null,
  ) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

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
  max-width: 480px;
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

const fieldGroup = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
`;

const fieldLabel = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const textarea = css`
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  line-height: 1.4;
  box-sizing: border-box;

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

export default function LightCardModal({
  card,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [text, setText] = useState(card?.text ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setLocalPreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const previewUrl =
    localPreview ?? (!imageRemoved ? (card?.image?.url ?? null) : null);

  function handleRemoveImage() {
    setImageFile(null);
    setImageRemoved(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    const removeImageId =
      imageRemoved || imageFile !== null ? (card?.image?.id ?? null) : null;
    try {
      await onSave({ text: text.trim() }, imageFile, removeImageId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={backdrop} onClick={onClose}>
      <div className={modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalHeader}>
          <h2>{card ? "Edit card" : "New grammar card"}</h2>
          <button className={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={formBody}>
            <div className={fieldGroup}>
              <span className={fieldLabel}>Text</span>
              <textarea
                ref={firstRef}
                className={textarea}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Grammar rule or example..."
                required
              />
            </div>

            <div className={fieldGroup}>
              <span className={fieldLabel}>Image</span>
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
