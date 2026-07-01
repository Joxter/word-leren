import { useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import {
  MOVE_STEPS,
  enqueueBottom,
  generateKeyBetween,
  moveToRank,
  removeFromLine,
  rankInLine,
  sortLine,
} from "../lib/queue";
import {
  useLines,
  useActiveLine,
  createLine,
  renameLine,
  deleteLine,
} from "../lib/lines";
import LineSelector from "../components/LineSelector";
import PlayButton from "../components/PlayButton";
import CardModal from "../components/CardModal";
import type { Card, CardData } from "./Cards";

const page = css`
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
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

const row = css`
  display: grid;
  grid-template-columns: 2.5rem 1fr 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    border-color: #bbb;
  }
`;

const rowSelected = css`
  border-color: #1a1a1a;

  &:hover {
    border-color: #1a1a1a;
  }
`;

const idx = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #aaa;
  text-align: right;
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
`;

const rowActions = css`
  display: flex;
  gap: 0.35rem;
  align-items: center;
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

  &:hover {
    background: #e8e8e8;
    border-color: #1a1a1a;
  }
`;

const removeBtn = css`
  color: #b91c1c;

  &:hover {
    border-color: #dc2626;
  }
`;

const toolbar = css`
  grid-column: 1 / -1;
  display: flex;
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

const toolbarLabel = css`
  font-size: 0.7rem;
  color: #aaa;
  margin-left: auto;
`;

const addPanel = css`
  margin-top: 1.5rem;
  border-top: 1px solid #eee;
  padding-top: 1rem;
`;

const addPanelTitle = css`
  font-size: 0.8rem;
  font-weight: 600;
  color: #555;
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const search = css`
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;

  &:focus {
    outline: none;
    border-color: #999;
  }
`;

const addRow = css`
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
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
}

export default function Line() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [addFilter, setAddFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);

  const { data, isLoading } = db.useQuery({
    cards: { image: {}, $: { limit: 5000 } },
  });

  const cards = (data?.cards ?? []) as LineCard[];
  const members = activeLine ? sortLine(cards, activeLine) : [];
  const notInLine = activeLine
    ? cards.filter((c) => rankInLine(c, activeLine) === undefined)
    : [];
  const filteredNotIn = notInLine.filter((c) => {
    if (!addFilter.trim()) return true;
    const q = addFilter.toLowerCase();
    return (
      c.aCard.toLowerCase().includes(q) || c.bCard.toLowerCase().includes(q)
    );
  });

  async function handleMove(index: number, steps: number) {
    if (!activeLine) return;
    const arr = members.slice();
    const [moving] = arr.splice(index, 1);
    if (!moving) return;
    const target = Math.max(0, Math.min(arr.length, index + steps));
    if (target === index) return;
    const left = arr[target - 1];
    const right = arr[target];
    const newRank = generateKeyBetween(
      left ? rankInLine(left, activeLine)! : null,
      right ? rankInLine(right, activeLine)! : null,
    );
    await moveToRank(moving.id, activeLine, newRank, steps);
  }

  async function handleAdd(cardId: string) {
    if (!activeLine || busy) return;
    setBusy(true);
    try {
      const bottom = members[members.length - 1];
      const bottomRank = bottom ? rankInLine(bottom, activeLine)! : null;
      await enqueueBottom(activeLine, [cardId], bottomRank);
    } finally {
      setBusy(false);
    }
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
        <LineSelector lines={lines} value={activeLine} onChange={setActiveLine} />
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
        <span className={spacer} />
        <button className={smallBtn} onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "Done adding" : "Add cards"}
        </button>
      </div>

      {!isLoading && members.length === 0 && (
        <div className={empty}>This line is empty. Add cards below.</div>
      )}

      <div className={list}>
        {members.map((e, i) => {
          const selected = e.id === selectedId;
          return (
            <div
              key={e.id}
              className={selected ? `${row} ${rowSelected}` : row}
              onClick={() => setSelectedId(selected ? null : e.id)}
            >
              <span className={idx}>{i + 1}</span>
              <div className={aCell}>
                <span className={cellText}>{e.aCard}</span>
                {e.audio && <PlayButton path={e.audio} small />}
              </div>
              <span className={cellText}>{e.bCard}</span>
              <div className={rowActions}>
                <button
                  className={rowBtn}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setModalCard(e as Card);
                  }}
                >
                  Edit
                </button>
                <button
                  className={`${rowBtn} ${removeBtn}`}
                  title="Remove from this line"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handleRemove(e.id);
                  }}
                >
                  ✕
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
                        onClick={() => handleMove(i, -s)}
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
                        onClick={() => handleMove(i, s)}
                      >
                        ↓{s}
                      </button>
                    ))}
                  </div>
                  <span className={toolbarLabel}>move steps</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className={addPanel}>
          <div className={addPanelTitle}>
            Add cards to this line
            <span style={{ color: "#aaa", fontWeight: 400 }}>
              ({notInLine.length} not in line)
            </span>
          </div>
          <input
            className={search}
            placeholder="Filter cards…"
            value={addFilter}
            onChange={(ev) => setAddFilter(ev.target.value)}
          />
          <div className={list}>
            {filteredNotIn.slice(0, 100).map((c) => (
              <div key={c.id} className={addRow}>
                <div className={aCell}>
                  <span className={cellText}>{c.aCard}</span>
                  {c.audio && <PlayButton path={c.audio} small />}
                </div>
                <span className={cellText}>{c.bCard}</span>
                <button
                  className={rowBtn}
                  disabled={busy}
                  onClick={() => handleAdd(c.id)}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
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
