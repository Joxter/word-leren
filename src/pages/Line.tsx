import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { css } from "@linaria/core";
import { db } from "../db";
import {
  MOVE_STEPS,
  safeKeyBetween,
  moveToRank,
  moveToTop,
  removeFromLine,
  rankInLine,
  reviewStats,
  sortLine,
} from "../lib/queue";
import type { CardLog } from "../lib/queue";
import { useLines, useActiveLine } from "../lib/lines";
import { mine } from "../lib/session";
import { saveCard } from "../lib/cards";
import LineSelector from "../components/LineSelector";
import PlayButton from "../components/PlayButton";
import CardModal from "../components/CardModal";
import type { Card, CardData } from "./Cards";

const page = css`
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
`;

const header = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
`;

const spacer = css`
  margin-left: auto;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

const listControls = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
`;

// Same shape as the line selector in the header, one step quieter — this picks
// a view of the list, not what the page is about.
const sortSelect = css`
  appearance: none;
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 0.4rem 1.7rem 0.4rem 0.6rem;
  font-size: 0.8rem;
  font-family: inherit;
  color: #333;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23888' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.6rem center;

  &:hover {
    border-color: #1a1a1a;
  }
`;

const countLabel = css`
  font-size: 0.75rem;
  color: #999;
`;

const tableWrap = css`
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
`;

// Shared grid template so the header and every row line up column-for-column.
// On phones the six columns don't fit, so each row rearranges into a
// three-line card via grid areas (the header is hidden there).
const cols = css`
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 3rem 5.5rem auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0.75rem;

  @media (max-width: 680px) {
    grid-template-columns: 1.75rem minmax(0, 1fr) auto;
    grid-template-areas:
      "idx a actions"
      "idx b actions"
      "idx seen last";
    gap: 0.3rem 0.5rem;
  }
`;

const row = css`
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #fafafa;
  }
`;

const rowSelected = css`
  background: #f0f0f0;

  &:hover {
    background: #f0f0f0;
  }
`;

const idx = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #aaa;
  text-align: right;

  @media (max-width: 680px) {
    grid-area: idx;
    align-self: start;
  }
`;

const cellText = css`
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const aCell = css`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;

  @media (max-width: 680px) {
    grid-area: a;
  }
`;

// The B-side cell of a queue row (needs its own name for the mobile layout).
const bCell = css`
  @media (max-width: 680px) {
    grid-area: b;
  }
`;

const seenCell = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: #999;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  @media (max-width: 680px) {
    grid-area: seen;
    justify-content: flex-start;
  }
`;

const ratingCell = css`
  display: flex;
  gap: 0.25rem;
  align-items: center;

  @media (max-width: 680px) {
    grid-area: last;
    justify-content: flex-end;
  }
`;

const ratingPill = css`
  border: 1px solid #e5e5e5;
  background: #fff;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #666;
  font-variant-numeric: tabular-nums;
`;

// The most recent rating, called out a touch stronger than the previous one.
const ratingLatest = css`
  border-color: #ccc;
  color: #1a1a1a;
`;

const rowActions = css`
  display: flex;
  gap: 0.35rem;
  align-items: center;
  justify-content: flex-end;

  /* Stacked vertically on phones, to the right of the two text lines. */
  @media (max-width: 680px) {
    grid-area: actions;
    flex-direction: column;
    align-items: stretch;
    align-self: start;
  }
`;

const rowBtn = css`
  background: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: #e8e8e8;
    border-color: #1a1a1a;
  }
`;

// Low-emphasis "remove from line", tucked into the expanded toolbar.
const removeLink = css`
  background: none;
  border: none;
  color: #b0b0b0;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.3rem 0.4rem;

  &:hover {
    color: #dc2626;
    text-decoration: underline;
  }
`;

const toolbar = css`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.5rem;
  margin-top: 0.25rem;
  border-top: 1px solid #f0f0f0;
`;

const stepGroup = css`
  display: flex;
  gap: 0.25rem;
`;

const stepBtn = css`
  background: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  font-variant-numeric: tabular-nums;

  &:hover {
    background: #e8e8e8;
  }
`;

// The orders the list can be shown in. "queue" is the line itself; the other
// two are read-only views of the same cards.
const SORTS = ["queue", "seen", "created"] as const;
type SortBy = (typeof SORTS)[number];

const SORT_LABELS: Record<SortBy, string> = {
  queue: "Queue order",
  seen: "Least seen",
  created: "Newest first",
};

interface LineCard {
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

export default function Line() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("queue");
  // Moving a card reorders the list, which otherwise resets the window scroll.
  // We stash the scroll position on a move and restore it once the new order
  // has committed (before paint) so the page stays put.
  const scrollTarget = useRef<number | null>(null);

  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);

  // Newest first, the same order the Cards page lists in — cards carry no
  // createdAt of their own, so their position in this result *is* their age.
  const { data, isLoading } = db.useQuery({
    cards: {
      image: {},
      $: { where: mine(), limit: 5000, order: { serverCreatedAt: "desc" } },
    },
  });

  const cards = (data?.cards ?? []) as LineCard[];
  const ageRank = new Map(cards.map((c, i) => [c.id, i]));
  // `members` is always in queue order — the move helpers below rely on it.
  const members = activeLine ? sortLine(cards, activeLine) : [];
  const statsById = new Map(members.map((c) => [c.id, reviewStats(c.log)]));
  const queuePos = new Map(members.map((c, i) => [c.id, i]));
  // Display order can differ from queue order (e.g. sorted by review count),
  // but moves still operate on the underlying queue via each card's id. Sorting
  // by "seen" puts the least-reviewed cards first, to surface neglected words.
  const displayMembers =
    sortBy === "seen"
      ? [...members].sort(
          (a, b) =>
            (statsById.get(a.id)?.seen ?? 0) - (statsById.get(b.id)?.seen ?? 0),
        )
      : sortBy === "created"
        ? [...members].sort(
            (a, b) => (ageRank.get(a.id) ?? 0) - (ageRank.get(b.id) ?? 0),
          )
        : members;

  // When the rendered order changes, restore any scroll position captured by a
  // move so reordering doesn't jump the page.
  const orderKey = displayMembers.map((m) => m.id).join(",");
  useLayoutEffect(() => {
    if (scrollTarget.current !== null) {
      window.scrollTo(0, scrollTarget.current);
      scrollTarget.current = null;
    }
  }, [orderKey]);
  async function handleMove(cardId: string, steps: number) {
    if (!activeLine) return;
    const index = members.findIndex((c) => c.id === cardId);
    if (index < 0) return;
    scrollTarget.current = window.scrollY;
    const arr = members.slice();
    const [moving] = arr.splice(index, 1);
    if (!moving) return;
    const target = Math.max(0, Math.min(arr.length, index + steps));
    if (target === index) return;
    const left = arr[target - 1];
    const right = arr[target];
    const newRank = safeKeyBetween(
      left ? rankInLine(left, activeLine)! : null,
      right ? rankInLine(right, activeLine)! : null,
    );
    await moveToRank(moving.id, activeLine, newRank, steps);
  }

  // Send a card back to the top of the queue — as high as possible without
  // sitting next to another fresh (not-yet-studied) card.
  async function handleMoveToTop(cardId: string) {
    if (!activeLine) return;
    const index = members.findIndex((c) => c.id === cardId);
    if (index <= 0) return; // not found, or already at the top
    scrollTarget.current = window.scrollY;
    await moveToTop(members, activeLine, cardId);
  }

  async function handleRemove(cardId: string) {
    if (!activeLine) return;
    await removeFromLine(activeLine, cardId);
    if (selectedId === cardId) setSelectedId(null);
  }

  async function handleUpdate(
    formData: CardData,
    imageFile: File | null,
    removeImageId: string | null,
  ): Promise<void> {
    await saveCard((modalCard as Card).id, formData, imageFile, removeImageId);
    setModalCard(null);
  }

  function handleDelete(cardId: string) {
    db.transact(db.tx.cards[cardId].delete());
    setModalCard(null);
  }

  if (!linesLoading && lines.length === 0) {
    return (
      <div className={page}>
        <div className={empty}>
          No lines yet. Create one on the{" "}
          <Link href="/account">Account page</Link> to start building a queue.
        </div>
      </div>
    );
  }

  return (
    <div className={page}>
      <div className={header}>
        <LineSelector
          lines={lines}
          value={activeLine}
          onChange={setActiveLine}
        />
      </div>

      {!isLoading && members.length === 0 && (
        <div className={empty}>This line is empty. Add cards below.</div>
      )}

      {members.length > 0 && (
        <>
          <div className={listControls}>
            <span className={countLabel}>{members.length} cards</span>
            <span className={spacer} />
            <select
              className={sortSelect}
              value={sortBy}
              title="Sort order"
              onChange={(ev) => setSortBy(ev.target.value as SortBy)}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className={tableWrap}>
            {displayMembers.map((e) => {
              const selected = e.id === selectedId;
              const pos = queuePos.get(e.id) ?? 0;
              const st = statsById.get(e.id) ?? { seen: 0, recent: [] };
              return (
                <div
                  key={e.id}
                  className={
                    selected
                      ? `${cols} ${row} ${rowSelected}`
                      : `${cols} ${row}`
                  }
                  onClick={() => setSelectedId(selected ? null : e.id)}
                >
                  <span className={idx}>{pos + 1}</span>
                  <div className={aCell}>
                    <span className={cellText}>{e.aCard}</span>
                    {e.audio && <PlayButton path={e.audio} small />}
                  </div>
                  <span className={`${cellText} ${bCell}`}>{e.bCard}</span>
                  <span
                    className={seenCell}
                    title={`Seen ${st.seen} ${st.seen === 1 ? "time" : "times"}`}
                  >
                    👁 {st.seen}
                  </span>
                  <span
                    className={ratingCell}
                    title="Last ratings (newest first)"
                  >
                    {st.recent.map((amount, j) => (
                      <span
                        key={j}
                        className={
                          j === 0 ? `${ratingPill} ${ratingLatest}` : ratingPill
                        }
                      >
                        {amount}
                      </span>
                    ))}
                  </span>
                  <div className={rowActions}>
                    <button
                      className={rowBtn}
                      title="Move to the front of the queue"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleMoveToTop(e.id);
                      }}
                    >
                      ⤒ Top
                    </button>
                  </div>

                  {selected && (
                    <div
                      className={toolbar}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <div className={stepGroup}>
                        {[...MOVE_STEPS].reverse().map((s) => (
                          <button
                            key={`up-${s}`}
                            className={stepBtn}
                            onClick={() => handleMove(e.id, -s)}
                          >
                            ↑{s}
                          </button>
                        ))}
                      </div>
                      <div className={stepGroup}>
                        {MOVE_STEPS.map((s) => (
                          <button
                            key={`down-${s}`}
                            className={stepBtn}
                            onClick={() => handleMove(e.id, s)}
                          >
                            ↓{s}
                          </button>
                        ))}
                      </div>
                      <button
                        className={rowBtn}
                        style={{ marginLeft: "auto" }}
                        onClick={() => setModalCard(e as Card)}
                      >
                        Edit
                      </button>
                      <button
                        className={removeLink}
                        onClick={() => handleRemove(e.id)}
                      >
                        Remove from line
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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
