import { useEffect, useState } from "react";
import { css } from "@linaria/core";
import { Link } from "wouter";
import { db } from "../db";
import { DEPTH_BUTTONS, placeAtDepth, sortLine } from "../lib/queue";
import { useLines, useActiveLine } from "../lib/lines";
import LineSelector from "../components/LineSelector";
import CardModal from "../components/CardModal";
import MarkdocContent from "../components/MarkdocContent";
import PlayButton from "../components/PlayButton";
import HintLetters from "../components/HintLetters";
import type { Card, CardData } from "./Cards";

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

const topBar = css`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
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

const langRow = css`
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

// Target language of the (hidden) answer, shown as a hint on the prompt.
const langHint = css`
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #bbb;
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

const actionRow = css`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;

const revealBtn = css`
  flex: 1;
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

const hintBtn = css`
  background: #fff;
  color: #1a1a1a;
  border: 1px solid #d5d5d5;
  padding: 0.85rem 1.25rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    border-color: #1a1a1a;
    background: #f7f7f7;
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

const editBtn = css`
  align-self: flex-end;
  background: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #333;
  cursor: pointer;

  &:hover {
    background: #e8e8e8;
    border-color: #1a1a1a;
  }
`;

interface LearnCard {
  id: string;
  aLang: string;
  bLang: string;
  aCard: string;
  bCard: string;
  note?: string;
  audio?: string;
  image?: { id: string; url: string; path: string };
  queues?: { [lineId: string]: { rank: string } };
}

export default function Learn() {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintLetters, setHintLetters] = useState<boolean[]>([]);

  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);

  const { data, isLoading } = db.useQuery({
    cards: { image: {}, $: { limit: 5000 } },
  });

  const cards = (data?.cards ?? []) as LearnCard[];
  const members = activeLine ? sortLine(cards, activeLine) : [];
  const current = members[0];

  async function handleDepth(depth: number) {
    if (!current || !activeLine || busy) return;
    setBusy(true);
    // InstantDB applies the transaction to the local cache optimistically, so
    // `current` can already be the next card by the time this function
    // resumes after the await below. Flip these synchronously, before the
    // await, so that render never shows the next card as already revealed.
    setRevealed(false);
    setHintOpen(false);
    setHintLetters([]);
    try {
      await placeAtDepth(members, activeLine, depth);
    } finally {
      setBusy(false);
    }
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
    // The deleted card was the top one; surface the next card face-down.
    setRevealed(false);
    setHintOpen(false);
    setHintLetters([]);
  }

  // Keyboard: space/enter reveals, "h" opens the hint; number keys pick a
  // depth button once revealed.
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
        } else if (e.key === "h" || e.key === "H") {
          e.preventDefault();
          if (current) setHintOpen(true);
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

  // Hint boxes are per-card scratch state — clear them whenever the top card
  // changes (depth placed, deleted, or swapped in from elsewhere).
  useEffect(() => {
    setHintOpen(false);
    setHintLetters([]);
  }, [current?.id]);

  if (isLoading || linesLoading) return <div className={page} />;

  if (lines.length === 0) {
    return (
      <div className={page}>
        <div className={empty}>
          No lines yet. Create one on the <Link href="/line">Line</Link> page.
        </div>
      </div>
    );
  }

  const selector = (
    <div className={topBar}>
      <LineSelector lines={lines} value={activeLine} onChange={setActiveLine} />
    </div>
  );

  if (!current) {
    return (
      <div className={page}>
        {selector}
        <div className={empty}>
          This line is empty. Add cards to it from the{" "}
          <Link href="/line">Line</Link> page.
        </div>
      </div>
    );
  }

  const c = current;

  return (
    <div className={page}>
      {selector}
      <div className={card}>
        <div className={sideBlock}>
          <div className={langRow}>
            <span className={langTag}>{c.bLang}</span>
            <span className={langHint}>→ {c.aLang}</span>
          </div>
          <div className={front}>{c.bCard}</div>
        </div>

        {!revealed && hintOpen && (
          <>
            <hr className={divider} />
            <HintLetters
              text={c.aCard}
              revealed={hintLetters}
              onReveal={(idx) =>
                setHintLetters((prev) => {
                  const next = [...prev];
                  next[idx] = true;
                  return next;
                })
              }
            />
          </>
        )}

        {revealed && (
          <>
            <hr className={divider} />
            <div className={sideBlock}>
              <span className={langTag}>{c.aLang}</span>
              <div className={frontRow}>
                <div className={front}>{c.aCard}</div>
                {c.audio && <PlayButton path={c.audio} small />}
              </div>
            </div>
            {c.note?.trim() && (
              <div className={noteBlock}>
                <MarkdocContent content={c.note} />
              </div>
            )}
            {c.image?.url && (
              <img className={cardImg} src={c.image.url} alt="" />
            )}
            <button
              className={editBtn}
              onClick={() => setModalCard(current as Card)}
            >
              Edit card
            </button>
          </>
        )}
      </div>

      {!revealed ? (
        <div className={actionRow}>
          {!hintOpen && (
            <button className={hintBtn} onClick={() => setHintOpen(true)}>
              Hint
            </button>
          )}
          <button className={revealBtn} onClick={() => setRevealed(true)}>
            Reveal
          </button>
        </div>
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
