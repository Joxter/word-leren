import { useState } from "react";
import { css } from "@linaria/core";
import { id } from "@instantdb/react";
import { db } from "../db";
import MarkdocContent from "../components/MarkdocContent";
import LightCardModal, {
  type LightCard,
  type LightCardData,
} from "../components/LightCardModal";

const page = css`
  max-width: 840px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const header = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;

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

  &:hover {
    background: #333;
  }
`;

const grid = css`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.875rem;
`;

const card = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;

  &:hover {
    border-color: #aaa;
  }
`;

const cardImg = css`
  width: 100%;
  height: 140px;
  object-fit: cover;
  display: block;
`;

const cardImgPlaceholder = css`
  width: 100%;
  height: 8px;
  background: #f0f0f0;
`;

const cardBody = css`
  padding: 0.75rem;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

export default function Grammar() {
  const [modalCard, setModalCard] = useState<LightCard | "new" | null>(null);

  const { data, isLoading } = db.useQuery({
    lightCards: {
      image: {},
      $: {
        limit: 500,
        order: { serverCreatedAt: "desc" },
      },
    },
  });

  const cards = (data?.lightCards ?? []) as LightCard[];

  async function handleSave(
    formData: LightCardData,
    imageFile: File | null,
    removeImageId: string | null,
  ): Promise<void> {
    const isNew = modalCard === "new";
    const cardId = isNew ? id() : (modalCard as LightCard).id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = [db.tx.lightCards[cardId].update(formData)];

    if (removeImageId) {
      ops.push(db.tx.lightCards[cardId].unlink({ image: removeImageId }));
      ops.push(db.tx.$files[removeImageId].delete());
    }

    if (imageFile) {
      const { data: fileData } = await db.storage.uploadFile(
        `lightCards/${cardId}-${Date.now()}`,
        imageFile,
      );
      if (fileData) {
        ops.push(db.tx.lightCards[cardId].link({ image: fileData.id }));
      }
    }

    await db.transact(ops);
    setModalCard(null);
  }

  function handleDelete(cardId: string) {
    db.transact(db.tx.lightCards[cardId].delete());
    setModalCard(null);
  }

  return (
    <div className={page}>
      <div className={header}>
        <h1>Grammar</h1>
        <button className={newBtn} onClick={() => setModalCard("new")}>
          New card
        </button>
      </div>

      {!isLoading && cards.length === 0 && (
        <div className={empty}>No grammar cards yet. Add your first card!</div>
      )}

      {cards.length > 0 && (
        <div className={grid}>
          {cards.map((c) => (
            <div key={c.id} className={card} onClick={() => setModalCard(c)}>
              {c.image ? (
                <img src={c.image.url} className={cardImg} alt="" />
              ) : (
                <div className={cardImgPlaceholder} />
              )}
              <div className={cardBody}>
                <MarkdocContent content={c.text} />
              </div>
            </div>
          ))}
        </div>
      )}

      {modalCard !== null && (
        <LightCardModal
          card={modalCard === "new" ? undefined : modalCard}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalCard(null)}
        />
      )}
    </div>
  );
}
