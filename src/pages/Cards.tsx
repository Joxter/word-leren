import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useImagePaste } from "../hooks/useImagePaste";
import { css } from "@linaria/core";
import { id } from "@instantdb/react";
import { db } from "../db";
import CardModal from "../components/CardModal";
import MarkdocField from "../components/MarkdocField";
import PlayButton from "../components/PlayButton";
import {
  MOVE_STEPS,
  safeKeyBetween,
  moveToRank,
  moveToTop,
  removeFromLine,
  rankInLine,
  reviewStats,
  sortLine,
  enqueueTop,
} from "../lib/queue";
import type { CardLog } from "../lib/queue";
import { saveCard, deleteCard, trimCardText } from "../lib/cards";
import { useLines, useActiveLine } from "../lib/lines";
import { myCards, ownedPath, ownerId } from "../lib/session";
import LineCheckboxes from "../components/LineCheckboxes";

export type Lang = "EN" | "RU" | "NL";

export interface CardData {
  aLang: string;
  bLang: string;
  aCard: string;
  bCard: string;
  note: string;
  // Path (relative to public/) to a side-A audio clip, e.g. "audio/dict/hond.mp3".
  audio: string;
}

export interface Card extends CardData {
  id: string;
  image?: { id: string; url: string; path: string };
  queues?: { [lineId: string]: { rank: string } };
}

const A_LANGS = ["NL", "EN"] as const;
const B_LANGS = ["EN", "RU"] as const;

const page = css`
  max-width: 840px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
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

const formSideRow = css`
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
  border: 1px solid #e8e8e8;
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
    background: transparent;
    color: #aaa;
    border-right: 1px solid #e8e8e8;
    transition:
      background 0.1s,
      color 0.1s;
    user-select: none;
  }

  &:last-child label {
    border-right: none;
  }

  input[type="radio"]:checked + label {
    background: #ebebeb;
    color: #333;
  }

  &:hover label {
    background: #f5f5f5;
    color: #888;
  }

  input[type="radio"]:checked + label:hover {
    background: #ebebeb;
    color: #333;
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

const formInput = css`
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  line-height: 1.4;

  &:focus {
    outline: none;
    border-color: #999;
  }
`;

const audioFieldGroup = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
`;

const audioRow = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const audioInput = css`
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;

  &:focus {
    outline: none;
    border-color: #999;
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

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 0;
  font-size: 0.875rem;
`;

const spacer = css`
  margin-left: auto;
`;

const listControls = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
`;

// A quiet control: this picks a view of the list, not what the page is about.
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

function makeDefaultForm(aLang: string, bLang: string): CardData {
  return { aLang, bLang, aCard: "", bCard: "", note: "", audio: "" };
}

export default function Cards() {
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("queue");
  // Moving a card reorders the list, which otherwise resets the window scroll.
  // We stash the scroll position on a move and restore it once the new order
  // has committed (before paint) so the page stays put.
  const scrollTarget = useRef<number | null>(null);

  const [newForm, setNewForm] = useState<CardData>(
    makeDefaultForm(A_LANGS[0], B_LANGS[0]),
  );
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newSaving, setNewSaving] = useState(false);
  // null means "untouched" → defaults to the line the list below shows.
  const [newLines, setNewLines] = useState<Set<string> | null>(null);

  const { lines, isLoading: linesLoading } = useLines();
  // The page shows one line — whichever is active. There is no selector here;
  // the Learn page owns that choice and this follows it.
  const [activeLine] = useActiveLine(lines);
  // Pre-check the shown line, so a new card lands where the user can see it.
  const defaultLineId = activeLine ?? lines[0]?.id;
  const selectedNewLines =
    newLines ?? new Set(defaultLineId ? [defaultLineId] : []);

  function toggleNewLine(lineId: string) {
    const next = new Set(selectedNewLines);
    next.has(lineId) ? next.delete(lineId) : next.add(lineId);
    setNewLines(next);
  }

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

  function setNew(field: keyof CardData, value: string) {
    setNewForm((prev) => ({ ...prev, [field]: value }));
  }

  // Newest first — cards carry no createdAt of their own, so their position in
  // this result *is* their age.
  const { data, isLoading } = db.useQuery({
    cards: {
      image: {},
      $: { where: myCards(), limit: 5000, order: { serverCreatedAt: "desc" } },
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setNewSaving(true);
    const cardId = id();
    const ops: any[] = [
      db.tx.cards[cardId]
        .update(trimCardText(newForm))
        .link({ owner: ownerId() }),
    ];
    if (newImageFile) {
      const { data: fileData } = await db.storage.uploadFile(
        ownedPath(`cards/${cardId}-${Date.now()}`),
        newImageFile,
      );
      if (fileData) {
        ops.push(db.tx.$files[fileData.id].link({ owner: ownerId() }));
        ops.push(db.tx.cards[cardId].link({ image: fileData.id }));
      }
    }
    await db.transact(ops);
    // Add the new card to the top of each checked line (default line by default).
    for (const lineId of selectedNewLines) {
      await enqueueTop(lineId, cardId);
    }
    // Keep the language pair — entering cards comes in runs of the same kind.
    setNewForm(makeDefaultForm(newForm.aLang, newForm.bLang));
    setNewImageFile(null);
    setNewLines(null);
    setNewSaving(false);
  }

  async function handleMove(cardId: string, steps: number) {
    if (!activeLine) return;
    const index = members.findIndex((c) => c.id === cardId);
    if (index < 0) return;
    const arr = members.slice();
    const [moving] = arr.splice(index, 1);
    if (!moving) return;
    const target = Math.max(0, Math.min(arr.length, index + steps));
    if (target === index) return;
    // Only now that the move is certain — a stashed position left behind by a
    // no-op would fire on the next reorder (or on adding a card) and scroll
    // the page somewhere the user did not ask to go.
    scrollTarget.current = window.scrollY;
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
    await saveCard(modalCard!, formData, imageFile, removeImageId);
    setModalCard(null);
  }

  function handleDelete(cardId: string) {
    deleteCard(cardId);
    setModalCard(null);
  }

  return (
    <div className={page}>
      <form className={inlineFormPanel} onSubmit={handleCreate}>
        <div className={formSides}>
          <div className={formSide}>
            <div className={formSideRow}>
              <span className={formLabel}>Card language</span>
              <div className={segmented}>
                {A_LANGS.map((l) => (
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
            </div>
            <span className={formLabel}>Скрытая сторона</span>
            <input
              className={formInput}
              value={newForm.aCard}
              onChange={(e) => setNew("aCard", e.target.value)}
              required
            />
            <div className={formSideRow}>
              <span className={formLabel}>Translation language</span>
              <div className={segmented}>
                {B_LANGS.map((l) => (
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
            </div>
            <span className={formLabel}>Открытая сторона</span>
            <input
              className={formInput}
              value={newForm.bCard}
              onChange={(e) => setNew("bCard", e.target.value)}
              required
            />
          </div>

          <div className={formSide}>
            <MarkdocField
              label="Note"
              value={newForm.note}
              onChange={(v) => setNew("note", v)}
            />
            <div>
              <span className={formLabel}>Image</span>
              <div style={{ marginTop: "0.375rem" }}>
                {newImagePreview ? (
                  <div className={formImageRow}>
                    <img
                      src={newImagePreview}
                      className={formPreviewImg}
                      alt=""
                    />
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
          </div>
        </div>

        <div className={audioFieldGroup}>
          <span className={formLabel}>Audio (side A)</span>
          <div className={audioRow}>
            <input
              className={audioInput}
              value={newForm.audio}
              onChange={(e) => setNew("audio", e.target.value)}
              placeholder="audio/dict/hond.mp3"
              autoComplete="off"
              spellCheck={false}
            />
            {newForm.audio.trim() && <PlayButton path={newForm.audio.trim()} />}
          </div>
        </div>

        <div className={audioFieldGroup}>
          <LineCheckboxes
            lines={lines}
            selected={selectedNewLines}
            onToggle={toggleNewLine}
          />
        </div>

        <div className={formFooter}>
          <button type="submit" className={createBtn} disabled={newSaving}>
            {newSaving ? "Saving…" : "Add card"}
          </button>
        </div>
      </form>

      {!linesLoading && lines.length === 0 && (
        <div className={empty}>
          No lines yet. Create one on the{" "}
          <Link href="/account">Account page</Link> to start building a queue.
        </div>
      )}

      {lines.length > 0 && !isLoading && members.length === 0 && (
        <div className={empty}>This line is empty. Add cards above.</div>
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
