import { css } from "@linaria/core";
import { Link } from "wouter";
import { db } from "../db";
import MarkdocContent from "../components/MarkdocContent";
import type { LightCard } from "../components/LightCardModal";

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
  text-decoration: none;
  display: inline-block;

  &:hover {
    background: #333;
  }
`;

const grid = css`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.875rem;
`;

const card = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;

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
  max-height: 220px;
  overflow: hidden;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

export default function Grammar() {
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

  return (
    <div className={page}>
      <div className={header}>
        <h1>Grammar</h1>
        <Link href="/grammar/new" className={newBtn}>
          New card
        </Link>
      </div>

      {!isLoading && cards.length === 0 && (
        <div className={empty}>No grammar cards yet. Add your first card!</div>
      )}

      {cards.length > 0 && (
        <div className={grid}>
          {cards.map((c) => (
            <Link key={c.id} href={`/grammar/${c.id}`} className={card}>
              {c.image ? (
                <img src={c.image.url} className={cardImg} alt="" />
              ) : (
                <div className={cardImgPlaceholder} />
              )}
              <div className={cardBody}>
                <MarkdocContent content={c.text} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
