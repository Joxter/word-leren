import { useLayoutEffect, useRef, useState } from "react";
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
  dailyReviewStats,
  sortLine,
} from "../lib/queue";
import type { CardLog } from "../lib/queue";
import {
  useLines,
  useActiveLine,
  createLine,
  renameLine,
  deleteLine,
} from "../lib/lines";
import { mine, ownedPath, ownerId } from "../lib/session";
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

const smallBtn = css`
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 0.45rem 0.8rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: #333;

  &:hover {
    border-color: #1a1a1a;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const dangerBtn = css`
  color: #dc2626;

  &:hover {
    border-color: #dc2626;
  }
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

const list = css`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const daysHeader = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.4rem;
  font-size: 0.7rem;
  color: #999;
`;

const daysLegend = css`
  display: flex;
  align-items: center;
  gap: 0.3rem;
`;

const daysBar = css`
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
`;

const dayBlock = css`
  flex: 1 1 0;
  min-width: 0;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 0.3rem 0.15rem 0.2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.15;
`;

// Days with no reviews are dimmed so active days stand out.
const dayEmpty = css`
  opacity: 0.45;
`;

// Today's block, called out with a slightly stronger frame.
const dayToday = css`
  border-color: #1a1a1a;
`;

const dayUnique = css`
  font-size: 0.85rem;
  font-weight: 700;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
`;

const dayTotal = css`
  font-size: 0.7rem;
  color: #999;
  font-variant-numeric: tabular-nums;
`;

const dayLabel = css`
  font-size: 0.6rem;
  color: #bbb;
  margin-top: 0.2rem;
`;

const listControls = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
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

const tableHead = css`
  background: #fafafa;
  border-bottom: 1px solid #eee;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #aaa;

  @media (max-width: 680px) {
    display: none;
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

const hRight = css`
  text-align: right;
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

// The prominent "push this card back 100 places" quick action.
const pushBtn = css`
  background: #1a1a1a;
  border: 1px solid #1a1a1a;
  border-radius: 5px;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  font-variant-numeric: tabular-nums;

  &:hover {
    background: #333;
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
  const [sortBy, setSortBy] = useState<"queue" | "seen">("queue");
  // Moving a card reorders the list, which otherwise resets the window scroll.
  // We stash the scroll position on a move and restore it once the new order
  // has committed (before paint) so the page stays put.
  const scrollTarget = useRef<number | null>(null);

  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);

  const { data, isLoading } = db.useQuery({
    cards: { image: {}, $: { where: mine(), limit: 5000 } },
  });

  const cards = (data?.cards ?? []) as LineCard[];
  // Daily study activity across all lines, for the strip near the top.
  const days = dailyReviewStats(cards, 14);
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

  async function handleNewLine() {
    const name = window.prompt("New line name:")?.trim();
    if (!name) return;
    const lineId = await createLine(name);
    setActiveLine(lineId);
  }

  async function handleRename() {
    if (!activeLine) return;
    const current = lines.find((l) => l.id === activeLine);
    const name = window.prompt("Rename line:", current?.name)?.trim();
    if (!name) return;
    await renameLine(activeLine, name);
  }

  async function handleDeleteLine() {
    if (!activeLine) return;
    const current = lines.find((l) => l.id === activeLine);
    const ok = window.confirm(
      `Delete line "${current?.name}"? Cards stay, but their place in this line is lost.`,
    );
    if (!ok) return;
    await deleteLine(activeLine);
  }

  async function handleUpdate(
    formData: CardData,
    imageFile: File | null,
    removeImageId: string | null,
  ): Promise<void> {
    const cardId = (modalCard as Card).id;
    const ops: any[] = [db.tx.cards[cardId].update(formData)];
    if (removeImageId) {
      ops.push(db.tx.cards[cardId].unlink({ image: removeImageId }));
      ops.push(db.tx.$files[removeImageId].delete());
    }
    if (imageFile) {
      const { data: fileData } = await db.storage.uploadFile(
        ownedPath(`cards/${cardId}-${Date.now()}`),
        imageFile,
      );
      if (fileData) {
        ops.push(db.tx.$files[fileData.id].link({ owner: ownerId() }));
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

  if (!linesLoading && lines.length === 0) {
    return (
      <div className={page}>
        <div className={header}>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Lines</h1>
          <button className={smallBtn} onClick={handleNewLine}>
            + New line
          </button>
        </div>
        <div className={empty}>
          No lines yet. Create one to start building a queue.
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
        <button className={smallBtn} onClick={handleNewLine}>
          + New
        </button>
        <button className={smallBtn} onClick={handleRename}>
          Rename
        </button>
        <button
          className={`${smallBtn} ${dangerBtn}`}
          onClick={handleDeleteLine}
        >
          Delete
        </button>
      </div>

      <div className={daysHeader}>
        <span>Last 14 days</span>
        <span className={daysLegend}>
          <span className={dayUnique}>unique</span>/
          <span className={dayTotal}>total</span>
        </span>
      </div>
      <div className={daysBar}>
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const cls = [dayBlock];
          if (isToday) cls.push(dayToday);
          if (d.total === 0) cls.push(dayEmpty);
          return (
            <div
              key={d.date.getTime()}
              className={cls.join(" ")}
              title={`${d.date.toLocaleDateString()} — ${d.unique} unique, ${d.total} total`}
            >
              <span className={dayUnique}>{d.unique}</span>
              <span className={dayTotal}>{d.total}</span>
              <span className={dayLabel}>{d.date.getDate()}</span>
            </div>
          );
        })}
      </div>

      {!isLoading && members.length === 0 && (
        <div className={empty}>This line is empty. Add cards below.</div>
      )}

      {members.length > 0 && (
        <>
          <div className={listControls}>
            <span className={countLabel}>{members.length} cards</span>
            <span className={spacer} />
            <button
              className={smallBtn}
              onClick={() =>
                setSortBy((s) => (s === "queue" ? "seen" : "queue"))
              }
            >
              Sort: {sortBy === "queue" ? "Queue order" : "Least seen"}
            </button>
          </div>

          <div className={tableWrap}>
            <div className={`${cols} ${tableHead}`}>
              <span className={hRight}>#</span>
              <span>A</span>
              <span>B</span>
              <span className={hRight}>Seen</span>
              <span>Last</span>
              <span />
            </div>
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
                    <button
                      className={pushBtn}
                      title="Move down 100 places"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleMove(e.id, 100);
                      }}
                    >
                      +100
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
