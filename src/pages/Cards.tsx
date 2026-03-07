import { useState } from "react";
import { css } from "@linaria/core";
import { id } from "@instantdb/react";
import { db } from "../db";
import CardModal from "../components/CardModal";

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
}

interface TabDef {
  label: string;
  aLang: string;
  bLang: string;
}

const TABS: TabDef[] = [
  { label: "NL → EN", aLang: "NL", bLang: "EN" },
  { label: "EN → RU", aLang: "EN", bLang: "RU" },
];

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

const list = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const cardRow = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    border-color: #aaa;
  }
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

export default function Cards() {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [modalCard, setModalCard] = useState<Card | "new" | null>(null);

  const { data, isLoading } = db.useQuery({
    cards: {
      $: {
        limit: 500,
        order: { serverCreatedAt: "desc" },
      },
    },
  });

  const activeTab = TABS[activeTabIdx];
  const allCards = (data?.cards ?? []) as Card[];
  const cards = allCards.filter(
    (c) => c.aLang === activeTab.aLang && c.bLang === activeTab.bLang,
  );

  function handleSave(formData: CardData) {
    if (modalCard === "new") {
      db.transact(db.tx.cards[id()].update(formData));
    } else if (modalCard) {
      db.transact(db.tx.cards[modalCard.id].update(formData));
    }
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
        <button className={newBtn} onClick={() => setModalCard("new")}>
          New card
        </button>
      </div>

      <div className={tabBar}>
        {TABS.map((t, i) => (
          <button
            key={t.label}
            className={i === activeTabIdx ? `${tab} ${tabActive}` : tab}
            onClick={() => setActiveTabIdx(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isLoading && cards.length === 0 && (
        <div className={empty}>No cards yet. Add your first card!</div>
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
            </div>
          ))}
        </div>
      )}

      {modalCard !== null && (
        <CardModal
          card={modalCard === "new" ? undefined : modalCard}
          defaultLangs={{ aLang: activeTab.aLang, bLang: activeTab.bLang }}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalCard(null)}
        />
      )}
    </div>
  );
}
