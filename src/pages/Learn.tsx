import { useEffect, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import { DEPTH_BUTTONS, placeAtDepth } from "../lib/queue";
import MarkdocContent from "../components/MarkdocContent";
import PlayButton from "../components/PlayButton";

const page = css`
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 5rem 0;
  font-size: 0.9rem;
`;

const card = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 2rem 1.75rem;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const sideBlock = css`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const langTag = css`
  align-self: flex-start;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #666;
  background: #f0f0f0;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
`;

const front = css`
  font-size: 1.5rem;
  font-weight: 600;
`;

const frontRow = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const divider = css`
  border: none;
  border-top: 1px solid #eee;
  margin: 0;
`;

const noteBlock = css`
  background: #fafafa;
  border-radius: 8px;
  padding: 0.75rem 0.875rem;
`;

const cardImg = css`
  max-width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 8px;
  align-self: flex-start;
`;

const revealBtn = css`
  width: 100%;
  margin-top: 1.25rem;
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.85rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: #333;
  }
`;

const depthRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.25rem;
`;

const depthBtn = css`
  flex: 1 1 0;
  min-width: 64px;
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 8px;
  padding: 0.7rem 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a1a;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;

  &:hover {
    border-color: #1a1a1a;
    background: #f7f7f7;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const depthHint = css`
  font-size: 0.6rem;
  font-weight: 500;
  color: #999;
  letter-spacing: 0.02em;
`;

const caption = css`
  text-align: center;
  font-size: 0.75rem;
  color: #aaa;
  margin-top: 0.875rem;
`;

interface QueueCard {
  id: string;
  rank: string;
  card?: {
    id: string;
    aLang: string;
    bLang: string;
    aCard: string;
    bCard: string;
    note?: string;
    audio?: string;
    image?: { url: string };
  };
}

export default function Learn() {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = db.useQuery({
    queueEntries: {
      card: { image: {} },
      $: { order: { rank: "asc" }, limit: 2 },
    },
  });

  const entries = (data?.queueEntries ?? []) as QueueCard[];
  const current = entries[0];

  async function handleDepth(depth: number) {
    if (!current?.card || busy) return;
    setBusy(true);
    try {
      await placeAtDepth(current.id, current.card.id, depth);
      setRevealed(false);
    } finally {
      setBusy(false);
    }
  }

  // Keyboard: space/enter reveals; number keys pick a depth button.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
      }
      if (!revealed) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          if (current) setRevealed(true);
        }
        return;
      }
      const n = parseInt(e.key, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= DEPTH_BUTTONS.length) {
        e.preventDefault();
        handleDepth(DEPTH_BUTTONS[n - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, current, busy]);

  if (isLoading) return <div className={page} />;

  if (!current?.card) {
    return (
      <div className={page}>
        <div className={empty}>
          The line is empty. Add a card, or backfill existing cards from the
          Line page.
        </div>
      </div>
    );
  }

  const c = current.card;

  return (
    <div className={page}>
      <div className={card}>
        <div className={sideBlock}>
          <span className={langTag}>{c.aLang}</span>
          <div className={frontRow}>
            <div className={front}>
              <MarkdocContent content={c.aCard} />
            </div>
            {c.audio && <PlayButton path={c.audio} small />}
          </div>
        </div>

        {revealed && (
          <>
            <hr className={divider} />
            <div className={sideBlock}>
              <span className={langTag}>{c.bLang}</span>
              <MarkdocContent content={c.bCard} />
            </div>
            {c.note?.trim() && (
              <div className={noteBlock}>
                <MarkdocContent content={c.note} />
              </div>
            )}
            {c.image?.url && <img className={cardImg} src={c.image.url} alt="" />}
          </>
        )}
      </div>

      {!revealed ? (
        <button className={revealBtn} onClick={() => setRevealed(true)}>
          Reveal
        </button>
      ) : (
        <>
          <div className={depthRow}>
            {DEPTH_BUTTONS.map((d, i) => (
              <button
                key={d}
                className={depthBtn}
                disabled={busy}
                onClick={() => handleDepth(d)}
              >
                {d}
                <span className={depthHint}>{i + 1}</span>
              </button>
            ))}
          </div>
          <div className={caption}>
            Drop this card to the N-th place from the top
          </div>
        </>
      )}
    </div>
  );
}
