import { css } from "@linaria/core";
import { Link, useParams } from "wouter";
import { db } from "../db";
import MarkdocContent from "../components/MarkdocContent";
import type { LightCard } from "../components/LightCardModal";

const page = css`
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const topBar = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.75rem;

  a {
    font-size: 0.875rem;
    color: #555;
    text-decoration: none;

    &:hover {
      color: #111;
    }
  }
`;

const editLink = css`
  background: #1a1a1a;
  color: #fff !important;
  padding: 0.45rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
`;

const heroImg = css`
  width: 100%;
  max-height: 360px;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  margin-bottom: 1.5rem;
`;

const content = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  padding: 1.5rem;
`;

const allCards = css`
  margin-top: 2.5rem;
  border-top: 1px solid #e5e5e5;
  padding-top: 1.5rem;
`;

const allCardsTitle = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.875rem;
`;

const cardLinks = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
`;

const cardLink = css`
  font-size: 0.9rem;
  color: #333;
  text-decoration: none;
  padding: 0.35rem 0;

  &:hover {
    color: #000;
  }
`;

const cardLinkCurrent = css`
  color: #111;
  font-weight: 600;
  cursor: default;
  pointer-events: none;
`;

const notFound = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

function cardName(text: string): string {
  const first = text.split("\n")[0].trim();
  return first.replace(/^#+\s*/, "") || "Untitled";
}

export default function GrammarDetail() {
  const { id: cardId } = useParams<{ id: string }>();

  const { data, isLoading } = db.useQuery({
    lightCards: {
      image: {},
      $: { where: { id: cardId } },
    },
  });

  const { data: allData } = db.useQuery({
    lightCards: {
      $: {
        limit: 500,
        order: { serverCreatedAt: "desc" },
      },
    },
  });

  const card = (data?.lightCards?.[0] ?? null) as LightCard | null;
  const allCardsList = (allData?.lightCards ?? []) as LightCard[];

  if (!isLoading && !card) {
    return (
      <div className={page}>
        <div className={notFound}>Card not found.</div>
      </div>
    );
  }

  return (
    <div className={page}>
      <div className={topBar}>
        <Link href="/grammar">← Back to Grammar</Link>
        {card && (
          <Link href={`/grammar/${cardId}/edit`} className={editLink}>
            Edit
          </Link>
        )}
      </div>

      {card && (
        <>
          {card.image && (
            <img src={card.image.url} className={heroImg} alt="" />
          )}
          <div className={content}>
            <MarkdocContent content={card.text} />
          </div>
        </>
      )}

      {allCardsList.length > 1 && (
        <div className={allCards}>
          <div className={cardLinks}>
            {allCardsList.map((c) =>
              c.id === cardId ? (
                <span key={c.id} className={`${cardLink} ${cardLinkCurrent}`}>
                  {cardName(c.text)}
                </span>
              ) : (
                <Link key={c.id} href={`/grammar/${c.id}`} className={cardLink}>
                  {cardName(c.text)}
                </Link>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
