import { useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import {
  MOVE_STEPS,
  enqueueBottom,
  generateKeyBetween,
  moveToRank,
} from "../lib/queue";

const page = css`
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const header = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }
`;

const backfillBtn = css`
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 0.45rem 0.875rem;
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
  grid-template-columns: 2.5rem 1fr 1fr;
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

interface LineEntry {
  id: string;
  rank: string;
  card?: {
    id: string;
    aLang: string;
    bLang: string;
    aCard: string;
    bCard: string;
  };
}

export default function Line() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const { data, isLoading } = db.useQuery({
    queueEntries: {
      card: {},
      $: { order: { rank: "asc" }, limit: 2000 },
    },
  });

  const unqueued = db.useQuery({
    cards: { queueEntry: {}, $: { limit: 2000 } },
  });

  const entries = (data?.queueEntries ?? []) as LineEntry[];
  const cardsWithoutEntry = (
    (unqueued.data?.cards ?? []) as { id: string; queueEntry?: unknown }[]
  ).filter((c) => !c.queueEntry);

  async function handleMove(index: number, steps: number) {
    const arr = entries.slice();
    const [moving] = arr.splice(index, 1);
    if (!moving?.card) return;
    const target = Math.max(0, Math.min(arr.length, index + steps));
    if (target === index) return;
    const left = arr[target - 1];
    const right = arr[target];
    const newRank = generateKeyBetween(
      left ? left.rank : null,
      right ? right.rank : null,
    );
    await moveToRank(moving.id, moving.card.id, newRank, steps);
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      await enqueueBottom(cardsWithoutEntry.map((c) => c.id));
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className={page}>
      <div className={header}>
        <h1>Line</h1>
        <button
          className={backfillBtn}
          disabled={backfilling || cardsWithoutEntry.length === 0}
          onClick={handleBackfill}
        >
          {cardsWithoutEntry.length > 0
            ? `Add ${cardsWithoutEntry.length} un-queued to bottom`
            : "All cards in line"}
        </button>
      </div>

      {!isLoading && entries.length === 0 && (
        <div className={empty}>The line is empty.</div>
      )}

      <div className={list}>
        {entries.map((e, i) => {
          const selected = e.id === selectedId;
          return (
            <div
              key={e.id}
              className={selected ? `${row} ${rowSelected}` : row}
              onClick={() => setSelectedId(selected ? null : e.id)}
            >
              <span className={idx}>{i + 1}</span>
              <span className={cellText}>{e.card?.aCard}</span>
              <span className={cellText}>{e.card?.bCard}</span>

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
    </div>
  );
}
