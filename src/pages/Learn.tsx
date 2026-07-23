import { useEffect, useState } from "react";
import { css } from "@linaria/core";
import { Link } from "wouter";
import { db } from "../db";
import {
  DEPTH_BUTTONS,
  placeAtDepth,
  reviewStats,
  sortLine,
} from "../lib/queue";
import type { CardLog } from "../lib/queue";
import { diffTyped } from "../lib/diff";
import { useLines, useActiveLine } from "../lib/lines";
import LineSelector from "../components/LineSelector";
import CardModal from "../components/CardModal";
import MarkdocContent from "../components/MarkdocContent";
import PlayButton, { playAudio } from "../components/PlayButton";
import HintLetters from "../components/HintLetters";
import VirtualKeyboard from "../components/VirtualKeyboard";
import type { Card, CardData } from "./Cards";

// On touch devices the "Type" mode uses our own on-screen keyboard and a fake
// input, so the phone's keyboard (with its autocomplete) never opens.
const COARSE_POINTER =
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

const page = css`
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
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
  padding: 1.5rem 1.25rem;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  /* Full-bleed on phones: cancel the page padding, drop the side chrome. */
  @media (max-width: 540px) {
    margin: 0 -0.75rem;
    border-left: none;
    border-right: none;
    border-radius: 0;
    padding: 1rem 0.875rem;
  }
`;

const sideBlock = css`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
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
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

// Top strip of the card: language tags on the left, "Edit card" on the right.
const cardTop = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
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

const cardImg = css`
  max-width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 8px;
  align-self: flex-start;
`;

const actionRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;

  @media (max-width: 540px) {
    gap: 0.5rem;
  }
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

const answerInput = css`
  flex: 1;
  min-width: 0;
  border: 1px solid #d5d5d5;
  border-radius: 8px;
  padding: 0.85rem;
  /* Never below 16px, or iOS zooms the page in when the input is focused. */
  font-size: 1rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #1a1a1a;
  }

  /* On phones the input takes a full row of its own, above the buttons. */
  @media (max-width: 540px) {
    flex-basis: 100%;
    order: -1;
  }
`;

// Div styled like the real input; shows what the virtual keyboard has typed.
const fakeInput = css`
  flex: 1;
  min-width: 0;
  border: 1px solid #1a1a1a;
  border-radius: 8px;
  padding: 0.85rem;
  font-size: 1rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  @media (max-width: 540px) {
    flex-basis: 100%;
    order: -1;
  }
`;

const fakeCaret = css`
  display: inline-block;
  width: 2px;
  height: 1.05em;
  background: #1a1a1a;
  margin-left: 1px;
  vertical-align: text-bottom;
  animation: blink 1.1s step-end infinite;

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
`;

// The typed answer shown above the correct one after reveal.
const typedAnswer = css`
  font-size: 1.5rem;
  font-weight: 600;
  color: #2e7d32;
`;

const typedWrong = css`
  color: #c62828;
  text-decoration: underline;
`;

// A letter of the correct answer the user skipped, shown as a faded red gap.
const typedMissing = css`
  color: #c62828;
  opacity: 0.45;
`;

const depthRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
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

const statsRow = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.75rem;
  color: #999;
`;

const statsPills = css`
  display: flex;
  gap: 0.3rem;
`;

const statsPill = css`
  border: 1px solid #e5e5e5;
  background: #fff;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #666;
  font-variant-numeric: tabular-nums;
`;

// The most recent rating, called out a touch stronger than the previous ones.
const statsPillLatest = css`
  border-color: #ccc;
  color: #1a1a1a;
`;

const captionRow = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #aaa;
  margin-top: 0.875rem;
`;

const disperseToggle = css`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #666;
  cursor: pointer;
  flex-shrink: 0;

  input {
    cursor: pointer;
  }
`;

const editBtn = css`
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
  log?: CardLog;
}

const DISPERSE_KEY = "word-leren:disperse";

export default function Learn() {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintLetters, setHintLetters] = useState<boolean[]>([]);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [disperse, setDisperse] = useState(
    () => localStorage.getItem(DISPERSE_KEY) === "1",
  );

  function toggleDisperse() {
    setDisperse((prev) => {
      const next = !prev;
      localStorage.setItem(DISPERSE_KEY, next ? "1" : "0");
      return next;
    });
  }

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
    const answer = typed.trim();
    // InstantDB applies the transaction to the local cache optimistically, so
    // `current` can already be the next card by the time this function
    // resumes after the await below. Flip these synchronously, before the
    // await, so that render never shows the next card as already revealed.
    setRevealed(false);
    setHintOpen(false);
    setHintLetters([]);
    setTyping(false);
    setTyped("");
    try {
      await placeAtDepth(members, activeLine, depth, disperse, answer);
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
    setTyping(false);
    setTyped("");
  }

  // Keyboard: space/enter reveals, "h" opens the hint, "t" opens the answer
  // input; number keys pick a depth button once revealed.
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
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          if (current) setTyping(true);
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
  }, [revealed, current, busy, disperse]);

  // Hint boxes and the typed answer are per-card scratch state — clear them
  // whenever the top card changes (depth placed, deleted, or swapped in).
  useEffect(() => {
    setHintOpen(false);
    setHintLetters([]);
    setTyping(false);
    setTyped("");
  }, [current?.id]);

  // Auto-play the answer's audio once the card is revealed.
  useEffect(() => {
    if (revealed && current?.audio) playAudio(current.audio);
  }, [revealed, current?.id]);

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
  // Past ratings for this card, to show alongside the depth buttons on reveal.
  const st = reviewStats(c.log, 5);

  return (
    <div className={page}>
      {selector}
      <div className={card}>
        <div className={sideBlock}>
          <div className={cardTop}>
            <div className={langRow}>
              <span className={langTag}>{c.bLang}</span>
              <span className={langHint}>→ {c.aLang}</span>
            </div>
            {revealed && (
              <button
                className={editBtn}
                onClick={() => setModalCard(current as Card)}
              >
                Edit card
              </button>
            )}
          </div>
          <div className={front}>{c.bCard}</div>
        </div>

        {!revealed && hintOpen && !(typing && COARSE_POINTER) && (
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
            {typed.trim() !== "" && (
              <div className={sideBlock}>
                <span className={langTag}>your answer</span>
                <div className={typedAnswer}>
                  {diffTyped(typed.trim(), c.aCard).map((d, i) => (
                    <span
                      key={i}
                      className={
                        d.kind === "wrong"
                          ? typedWrong
                          : d.kind === "missing"
                            ? typedMissing
                            : undefined
                      }
                    >
                      {d.ch}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className={frontRow}>
              <div className={front}>{c.aCard}</div>
              {c.audio && <PlayButton path={c.audio} small />}
            </div>
            {c.note?.trim() && <MarkdocContent content={c.note} />}
            {c.image?.url && (
              <img className={cardImg} src={c.image.url} alt="" />
            )}
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
          {typing ? (
            COARSE_POINTER ? (
              <div className={fakeInput}>
                {typed}
                <span className={fakeCaret} />
              </div>
            ) : (
              <input
                className={answerInput}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setRevealed(true);
                  }
                }}
                placeholder={`Type the ${c.aLang} answer…`}
              />
            )
          ) : (
            <button className={hintBtn} onClick={() => setTyping(true)}>
              Type
            </button>
          )}
          <button className={revealBtn} onClick={() => setRevealed(true)}>
            Reveal
          </button>
        </div>
      ) : null}

      {!revealed && typing && COARSE_POINTER && (
        <VirtualKeyboard
          onKey={(ch) => setTyped((prev) => prev + ch)}
          onBackspace={() => setTyped((prev) => prev.slice(0, -1))}
          // The hint here dims the keys the answer doesn't use, instead of the
          // letter slots. Diacritics fold to their base letter (ë → e).
          allowed={
            hintOpen
              ? new Set(
                  c.aCard
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, ""),
                )
              : null
          }
        />
      )}

      {revealed && (
        <>
          <div className={depthRow}>
            {DEPTH_BUTTONS.map((d) => (
              <button
                key={d}
                className={depthBtn}
                disabled={busy}
                onClick={() => handleDepth(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <div className={captionRow}>
            <span>Drop this card to the N-th place from the top</span>
            <label className={disperseToggle}>
              <input
                type="checkbox"
                checked={disperse}
                onChange={toggleDisperse}
              />
              Disperse
            </label>
          </div>
          {st.seen > 0 && (
            <div className={statsRow}>
              <span>
                Seen {st.seen}
                {st.seen === 1 ? " time" : " times"}
              </span>
              {st.recent.length > 0 && (
                <>
                  <span>·</span>
                  <span
                    className={statsPills}
                    title="Last ratings (newest first)"
                  >
                    {st.recent.map((amount, j) => (
                      <span
                        key={j}
                        className={
                          j === 0
                            ? `${statsPill} ${statsPillLatest}`
                            : statsPill
                        }
                      >
                        {amount}
                      </span>
                    ))}
                  </span>
                </>
              )}
            </div>
          )}
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
