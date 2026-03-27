import { useEffect, useState } from "react";
import { useImagePaste } from "../hooks/useImagePaste";
import { css } from "@linaria/core";
import { id } from "@instantdb/react";
import { db } from "../db";
import CardModal from "../components/CardModal";
import MarkdocField from "../components/MarkdocField";

export type Lang = "EN" | "RU" | "NL";

export interface CardData {
  aLang: string;
  bLang: string;
  aCard: string;
  bCard: string;
  note: string;
}

export interface Card extends CardData {
  id: string;
  image?: { id: string; url: string; path: string };
}

interface TabDef {
  label: string;
  aLang: string;
  bLang: string;
}

const TABS: TabDef[] = [
  { label: "NL → EN", aLang: "NL", bLang: "EN" },
  { label: "NL → RU", aLang: "NL", bLang: "RU" },
  { label: "EN → RU", aLang: "EN", bLang: "RU" },
];

const LANGS = ["EN", "RU", "NL"] as const;

const page = css`
  max-width: 840px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const header = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }
`;

const tabBar = css`
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
`;

const tab = css`
  padding: 0.4rem 0.875rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  background: #e8e8e8;
  color: #555;

  &:hover {
    background: #ddd;
  }
`;

const tabActive = css`
  background: #1a1a1a;
  color: #fff;

  &:hover {
    background: #333;
  }
`;

const inlineFormPanel = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1.5rem;
`;

const formSides = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 0;

  @media (max-width: 540px) {
    grid-template-columns: 1fr;
  }
`;

const formSide = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const formLabel = css`
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

const formImageRow = css`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
`;

const formPreviewImg = css`
  width: 80px;
  height: 56px;
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

const formFooter = css`
  display: flex;
  justify-content: flex-end;
  padding-top: 0.875rem;
  border-top: 1px solid #f0f0f0;
  margin-top: 0.25rem;
`;

const createBtn = css`
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.45rem 1.25rem;
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

const list = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const cardRow = css`
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  cursor: pointer;
  align-items: center;

  &:hover {
    border-color: #aaa;
  }
`;

const rowThumb = css`
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
`;

const rowThumbPlaceholder = css`
  width: 40px;
`;

const cardSide = css`
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  min-width: 0;
`;

const langTag = css`
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #666;
  background: #f0f0f0;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
`;

const cardText = css`
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

function makeDefaultForm(aLang: string, bLang: string): CardData {
  return { aLang, bLang, aCard: "", bCard: "", note: "" };
}

export default function Cards() {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [modalCard, setModalCard] = useState<Card | null>(null);

  const activeTab = TABS[activeTabIdx];

  const [newForm, setNewForm] = useState<CardData>(
    makeDefaultForm(activeTab.aLang, activeTab.bLang),
  );
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newSaving, setNewSaving] = useState(false);

  useEffect(() => {
    if (!newImageFile) {
      setNewImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(newImageFile);
    setNewImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newImageFile]);

  useImagePaste((file) => setNewImageFile(file));

  function switchTab(i: number) {
    setActiveTabIdx(i);
    setNewForm((prev) => ({
      ...prev,
      aLang: TABS[i].aLang,
      bLang: TABS[i].bLang,
    }));
  }

  function setNew(field: keyof CardData, value: string) {
    setNewForm((prev) => ({ ...prev, [field]: value }));
  }

  const { data, isLoading } = db.useQuery({
    cards: {
      image: {},
      $: {
        limit: 500,
        order: { serverCreatedAt: "desc" },
      },
    },
  });

  const allCards = (data?.cards ?? []) as Card[];
  const cards = allCards.filter(
    (c) => c.aLang === activeTab.aLang && c.bLang === activeTab.bLang,
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setNewSaving(true);
    const cardId = id();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = [db.tx.cards[cardId].update(newForm)];
    if (newImageFile) {
      const { data: fileData } = await db.storage.uploadFile(
        `cards/${cardId}-${Date.now()}`,
        newImageFile,
      );
      if (fileData) {
        ops.push(db.tx.cards[cardId].link({ image: fileData.id }));
      }
    }
    await db.transact(ops);
    setNewForm(makeDefaultForm(activeTab.aLang, activeTab.bLang));
    setNewImageFile(null);
    setNewSaving(false);
  }

  async function handleUpdate(
    formData: CardData,
    imageFile: File | null,
    removeImageId: string | null,
  ): Promise<void> {
    const cardId = (modalCard as Card).id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = [db.tx.cards[cardId].update(formData)];
    if (removeImageId) {
      ops.push(db.tx.cards[cardId].unlink({ image: removeImageId }));
      ops.push(db.tx.$files[removeImageId].delete());
    }
    if (imageFile) {
      const { data: fileData } = await db.storage.uploadFile(
        `cards/${cardId}-${Date.now()}`,
        imageFile,
      );
      if (fileData) {
        ops.push(db.tx.cards[cardId].link({ image: fileData.id }));
      }
    }
    await db.transact(ops);
    setModalCard(null);
  }

  function handleDelete(cardId: string) {
    db.transact(db.tx.cards[cardId].delete());
    setModalCard(null);
  }

  return (
    <div className={page}>
      <div className={header}>
        <h1>Cards test GH</h1>
      </div>

      <div className={tabBar}>
        {TABS.map((t, i) => (
          <button
            key={t.label}
            className={i === activeTabIdx ? `${tab} ${tabActive}` : tab}
            onClick={() => switchTab(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className={inlineFormPanel} onSubmit={handleCreate}>
        <div className={formSides}>
          <div className={formSide}>
            <span className={formLabel}>Language A</span>
            <div className={segmented}>
              {LANGS.map((l) => (
                <div key={l} className={segmentedItem}>
                  <input
                    type="radio"
                    id={`new-aLang-${l}`}
                    name="new-aLang"
                    value={l}
                    checked={newForm.aLang === l}
                    onChange={() => setNew("aLang", l)}
                  />
                  <label htmlFor={`new-aLang-${l}`}>{l}</label>
                </div>
              ))}
            </div>
            <MarkdocField
              label="Word / Phrase"
              value={newForm.aCard}
              onChange={(v) => setNew("aCard", v)}
              rows={3}
              required
            />
          </div>

          <div className={formSide}>
            <span className={formLabel}>Language B</span>
            <div className={segmented}>
              {LANGS.map((l) => (
                <div key={l} className={segmentedItem}>
                  <input
                    type="radio"
                    id={`new-bLang-${l}`}
                    name="new-bLang"
                    value={l}
                    checked={newForm.bLang === l}
                    onChange={() => setNew("bLang", l)}
                  />
                  <label htmlFor={`new-bLang-${l}`}>{l}</label>
                </div>
              ))}
            </div>
            <MarkdocField
              label="Translation"
              value={newForm.bCard}
              onChange={(v) => setNew("bCard", v)}
              rows={3}
              required
            />
          </div>
        </div>

        <MarkdocField
          label="Note"
          value={newForm.note}
          onChange={(v) => setNew("note", v)}
          rows={2}
        />

        <div style={{ marginBottom: "0.75rem" }}>
          <span className={formLabel}>Image</span>
          <div style={{ marginTop: "0.375rem" }}>
            {newImagePreview ? (
              <div className={formImageRow}>
                <img src={newImagePreview} className={formPreviewImg} alt="" />
                <button
                  type="button"
                  className={removeImgBtn}
                  onClick={() => setNewImageFile(null)}
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
                    if (file) setNewImageFile(file);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className={formFooter}>
          <button type="submit" className={createBtn} disabled={newSaving}>
            {newSaving ? "Saving…" : "Add card"}
          </button>
        </div>
      </form>

      {!isLoading && cards.length === 0 && (
        <div className={empty}>No cards yet.</div>
      )}

      {cards.length > 0 && (
        <div className={list}>
          {cards.map((card) => (
            <div
              key={card.id}
              className={cardRow}
              onClick={() => setModalCard(card)}
            >
              <div className={cardSide}>
                <span className={langTag}>{card.aLang}</span>
                <span className={cardText}>{card.aCard}</span>
              </div>
              <div className={cardSide}>
                <span className={langTag}>{card.bLang}</span>
                <span className={cardText}>{card.bCard}</span>
              </div>
              {card.image ? (
                <img src={card.image.url} className={rowThumb} alt="" />
              ) : (
                <div className={rowThumbPlaceholder} />
              )}
            </div>
          ))}
        </div>
      )}

      {modalCard !== null && (
        <CardModal
          card={modalCard}
          onSave={handleUpdate}
          onDelete={handleDelete}
          onClose={() => setModalCard(null)}
        />
      )}
    </div>
  );
}
