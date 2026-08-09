import { useEffect, useRef, useState } from "react";
import { useImagePaste } from "../hooks/useImagePaste";
import { css } from "@linaria/core";
import { id as genId } from "@instantdb/react";
import { Link, useLocation, useParams } from "wouter";
import { db } from "../db";
import MarkdocContent from "../components/MarkdocContent";
import { ownedPath, ownerId } from "../lib/session";
import type { LightCard } from "../components/LightCardModal";

const page = css`
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const topBar = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.75rem;
  gap: 1rem;

  a {
    font-size: 0.875rem;
    color: #555;
    text-decoration: none;
    white-space: nowrap;

    &:hover {
      color: #111;
    }
  }
`;

const topActions = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const saveBtn = css`
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.45rem 1.1rem;
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
  padding: 0.45rem 0.75rem;
  border-radius: 6px;

  &:hover {
    background: #fef2f2;
  }
`;

const layout = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: start;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const formCol = css`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const fieldLabel = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: block;
  margin-bottom: 0.375rem;
`;

const textarea = css`
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  resize: none;
  line-height: 1.5;
  box-sizing: border-box;
  min-height: 260px;
  overflow-y: hidden;

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
  width: 110px;
  height: 75px;
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

const previewCol = css`
  position: sticky;
  top: 1.5rem;

  @media (max-width: 680px) {
    display: none;
  }
`;

const previewHeader = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.75rem;
`;

const previewBox = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  overflow: hidden;
`;

const previewHeroImg = css`
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  display: block;
`;

const previewContent = css`
  padding: 1rem 1.25rem;
`;

const previewEmpty = css`
  padding: 1rem 1.25rem;
  font-size: 0.8rem;
  color: #bbb;
  font-style: italic;
`;

export default function GrammarEdit() {
  const { id: cardId } = useParams<{ id?: string }>();
  const isNew = !cardId;
  const stableId = useRef(genId());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }
  const [, navigate] = useLocation();

  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  const { data } = db.useQuery(
    cardId
      ? {
          lightCards: {
            image: {},
            $: { where: { id: cardId } },
          },
        }
      : null,
  );

  const card = (data?.lightCards?.[0] ?? null) as LightCard | null;

  useEffect(() => {
    if (card && !loaded) {
      setText(card.text);
      setLoaded(true);
    }
  }, [card, loaded]);

  useEffect(() => {
    if (textareaRef.current) autoResize(textareaRef.current);
  }, [text]);

  useEffect(() => {
    if (!imageFile) {
      setLocalPreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useImagePaste((file) => {
    setImageFile(file);
    setImageRemoved(false);
  });

  const imagePreviewUrl =
    localPreview ?? (!imageRemoved ? (card?.image?.url ?? null) : null);

  function handleRemoveImage() {
    setImageFile(null);
    setImageRemoved(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);

    const targetId = isNew ? stableId.current : cardId!;
    const ops: any[] = [
      isNew
        ? db.tx.lightCards[targetId]
            .update({ text: text.trim() })
            .link({ owner: ownerId() })
        : db.tx.lightCards[targetId].update({ text: text.trim() }),
    ];

    if (!isNew && (imageRemoved || imageFile !== null) && card?.image?.id) {
      ops.push(db.tx.lightCards[targetId].unlink({ image: card.image.id }));
      ops.push(db.tx.$files[card.image.id].delete());
    }

    if (imageFile) {
      const { data: fileData } = await db.storage.uploadFile(
        ownedPath(`lightCards/${targetId}-${Date.now()}`),
        imageFile,
      );
      if (fileData) {
        ops.push(db.tx.$files[fileData.id].link({ owner: ownerId() }));
        ops.push(db.tx.lightCards[targetId].link({ image: fileData.id }));
      }
    }

    try {
      await db.transact(ops);
      navigate(`/grammar/${targetId}`);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!cardId) return;
    db.transact(db.tx.lightCards[cardId].delete());
    navigate("/grammar");
  }

  const backHref = isNew ? "/grammar" : `/grammar/${cardId}`;
  const title = isNew ? "New grammar card" : "Edit";

  return (
    <div className={page}>
      <div className={topBar}>
        <Link href={backHref}>← Back</Link>
        <div className={topActions}>
          {!isNew && (
            <button type="button" className={deleteBtn} onClick={handleDelete}>
              Delete
            </button>
          )}
          <button
            type="submit"
            form="grammar-edit-form"
            className={saveBtn}
            disabled={saving}
          >
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </button>
        </div>
      </div>

      <form id="grammar-edit-form" onSubmit={handleSave}>
        <div className={layout}>
          <div className={formCol}>
            <div>
              <label className={fieldLabel}>Text</label>
              <textarea
                ref={textareaRef}
                className={textarea}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  autoResize(e.target);
                }}
                placeholder="Grammar rule or example…"
                autoFocus
                required
              />
            </div>

            <div>
              <span className={fieldLabel}>Image</span>
              {imagePreviewUrl ? (
                <div className={imageRow}>
                  <img src={imagePreviewUrl} className={previewImg} alt="" />
                  <button
                    type="button"
                    className={removeImgBtn}
                    onClick={handleRemoveImage}
                  >
                    Remove
                  </button>
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

          <div className={previewCol}>
            <div className={previewHeader}>Preview</div>
            <div className={previewBox}>
              {imagePreviewUrl && (
                <img src={imagePreviewUrl} className={previewHeroImg} alt="" />
              )}
              {text.trim() ? (
                <div className={previewContent}>
                  <MarkdocContent content={text} />
                </div>
              ) : (
                <div className={previewEmpty}>Nothing to preview</div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
