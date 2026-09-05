import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useImagePaste } from "../hooks/useImagePaste";
import { css } from "@linaria/core";
import { id } from "@instantdb/react";
import { db } from "../db";
import CardModal from "../components/CardModal";
import MarkdocField from "../components/MarkdocField";
import PlayButton from "../components/PlayButton";
import { reviewStats, sortLine, enqueueTop } from "../lib/queue";
import type { CardLog } from "../lib/queue";
import { difficultyColor, introduce, rateCard, Rating } from "../lib/srs";
import type { SrsState } from "../lib/srs";
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
  srs?: SrsState;
}

// Every new card is NL → EN; the picker that used to ask was left over from an
// older idea of the deck. The fields stay on the form, just unasked.
const NEW_LANGS = { a: "NL", b: "EN" };

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

const formLabel = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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
  /* Every column is a fixed width or a share of what's left, none of them
     content-sized: each row is its own grid, so a column that sizes to its
     content lands somewhere else on the next row. The actions column holds one
     button that only studied cards have — sized to content it was zero wide on
     the rows without it, and the text columns beside it shifted. */
  grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 1.5rem 4.5rem;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0.75rem;

  @media (max-width: 680px) {
    grid-template-columns: 1.75rem minmax(0, 1fr) 4.5rem;
    grid-template-areas:
      "idx a actions"
      "idx b actions"
      "idx diff diff";
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

const diffCell = css`
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 680px) {
    grid-area: diff;
    justify-content: flex-start;
  }
`;

// How hard the card is, in the same green→red as the Account page's swarm.
// An unstudied card has no difficulty to show, so it gets an empty ring rather
// than a colour that would claim something.
const diffDot = css`
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 1px solid #e0e0e0;
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
  srs?: SrsState;
}

function makeDefaultForm(aLang: string, bLang: string): CardData {
  return { aLang, bLang, aCard: "", bCard: "", note: "", audio: "" };
}

export default function Cards() {
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("queue");
  const [newForm, setNewForm] = useState<CardData>(
    makeDefaultForm(NEW_LANGS.a, NEW_LANGS.b),
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
    // Straight into study: a hand-entered card is one you just decided to
    // learn, so it gets its FSRS state now rather than sitting in the Backlog.
    await introduce([cardId], [...selectedNewLines][0] ?? "");
    // Keep the language pair — entering cards comes in runs of the same kind.
    setNewForm(makeDefaultForm(newForm.aLang, newForm.bLang));
    setNewImageFile(null);
    setNewLines(null);
    setNewSaving(false);
  }

  /** Met the word in the wild and blanked on it: grade it Again from the list,
   *  so it comes back in a few minutes instead of waiting out a schedule the
   *  failure just disproved. Logged as `source: "field"` — it is a real review,
   *  it just didn't happen in a session. */
  async function handleRateAgain(card: Card) {
    await rateCard(card, activeLine ?? "", Rating.Again, "", "", "field");
  }

  function handleDelete(cardId: string) {
    // Soft: `deleteCard` stamps `deletedAt`, the row and its history stay.
    deleteCard(cardId);
    setModalCard(null);
  }

  async function handleUpdate(
    formData: CardData,
    imageFile: File | null,
    removeImageId: string | null,
  ): Promise<void> {
    await saveCard(modalCard!, formData, imageFile, removeImageId);
    setModalCard(null);
  }

  return (
    <div className={page}>
      <form className={inlineFormPanel} onSubmit={handleCreate}>
        <div className={formSides}>
          <div className={formSide}>
            <span className={formLabel}>Скрытая сторона</span>
            <input
              className={formInput}
              value={newForm.aCard}
              onChange={(e) => setNew("aCard", e.target.value)}
              required
            />
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
              const pos = queuePos.get(e.id) ?? 0;
              const graded = !!e.srs && e.srs.reps > 0;
              return (
                <div
                  key={e.id}
                  className={`${cols} ${row}`}
                  onClick={() => setModalCard(e as Card)}
                >
                  <span className={idx}>{pos + 1}</span>
                  <div className={aCell}>
                    <span className={cellText}>{e.aCard}</span>
                    {e.audio && <PlayButton path={e.audio} small />}
                  </div>
                  <span className={`${cellText} ${bCell}`}>{e.bCard}</span>
                  {/* `introduce` seeds an empty FSRS card, so a card taken
                      into study but not yet answered has `srs` with a
                      difficulty of 0 — which is not "the easiest card there
                      is", it is "no answer to judge by". `reps` is what tells
                      the two apart. */}
                  <span
                    className={diffCell}
                    title={
                      graded
                        ? `Difficulty ${e.srs!.difficulty.toFixed(1)} of 10`
                        : "Not answered yet"
                    }
                  >
                    <span
                      className={diffDot}
                      style={
                        graded
                          ? { background: difficultyColor(e.srs!.difficulty) }
                          : undefined
                      }
                    />
                  </span>
                  <div className={rowActions}>
                    {/* Only for a card already in study — an unstudied one has
                        no schedule to knock down. */}
                    {graded && (
                      <button
                        className={rowBtn}
                        title="Встретил в жизни и не вспомнил: оценка Again, карточка вернётся через несколько минут"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleRateAgain(e as Card);
                        }}
                      >
                        Забыл
                      </button>
                    )}
                  </div>
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
