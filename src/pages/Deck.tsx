import { useState } from "react";
import { css } from "@linaria/core";
import { Link } from "wouter";
import { db } from "../db";
import { myCards } from "../lib/session";
import { useLines, useActiveLine } from "../lib/lines";
import { newPool, introduce, markKnown, type SrsState } from "../lib/srs";
import LineSelector from "../components/LineSelector";

// Everything that hasn't been taken into study yet, and the two ways to move
// it: mark a card known (straight to ~a week out, skipping the learning steps)
// or take it in to learn properly.
//
// Triage runs in fixed batches so a long list can't be mis-ticked wholesale;
// the add tab shows the whole pool at once, because there the point is picking
// a themed handful out of everything.

const BATCH = 10;

const page = css`
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
`;

const topBar = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const tabs = css`
  display: flex;
  gap: 0.5rem;
`;

const tab = css`
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
  font-family: inherit;
  color: #444;
  cursor: pointer;

  &:hover {
    border-color: #1a1a1a;
  }
`;

const tabOn = css`
  background: #1a1a1a;
  border-color: #1a1a1a;
  color: #fff;
`;

const intro = css`
  font-size: 0.85rem;
  color: #777;
  line-height: 1.5;
  margin-bottom: 1rem;
`;

const list = css`
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
`;

const row = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  user-select: none;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #fafafa;
  }

  input {
    cursor: pointer;
    flex-shrink: 0;
    width: 1.1rem;
    height: 1.1rem;
  }
`;

const rowOn = css`
  background: #f0f7ff;

  &:hover {
    background: #e8f2ff;
  }
`;

const sideA = css`
  font-weight: 600;
  font-size: 1rem;
`;

const sideB = css`
  color: #777;
  font-size: 0.9rem;
`;

const texts = css`
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
`;

const actions = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 1rem 0;
  position: sticky;
  bottom: 0;
  background: #fff;
  padding: 0.75rem 0;
  border-top: 1px solid #eee;
`;

const btn = css`
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 500;
  color: #1a1a1a;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: #1a1a1a;
    background: #f7f7f7;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const primaryBtn = css`
  background: #1a1a1a;
  border-color: #1a1a1a;
  color: #fff;

  &:hover:not(:disabled) {
    background: #333;
    color: #fff;
  }
`;

const counter = css`
  font-size: 0.85rem;
  color: #777;
  margin-left: auto;
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 4rem 1rem;
  font-size: 0.9rem;
  line-height: 1.6;
`;

interface DeckCard {
  id: string;
  aCard: string;
  bCard: string;
  srs?: SrsState;
  queues?: { [lineId: string]: { rank: string } };
}

export default function Deck() {
  const [mode, setMode] = useState<"triage" | "add">("triage");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // How far triage has been paged through. Cards are never consumed by
  // skipping, so this is a cursor, not a mutation.
  const [skippedCount, setSkipped] = useState(0);

  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);

  const { data, isLoading } = db.useQuery({
    cards: { $: { where: myCards(), limit: 5000 } },
  });

  const cards = (data?.cards ?? []) as DeckCard[];
  const pool = activeLine ? newPool(cards, activeLine) : [];
  // Triage works through the pool a screenful at a time; adding sees it all.
  const batch =
    mode === "triage" ? pool.slice(skippedCount, skippedCount + BATCH) : pool;

  function toggle(cardId: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  /** Tick five cards at random among those not already ticked. */
  function addRandomFive() {
    const free = batch.filter((c) => !ticked.has(c.id));
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    setTicked((prev) => {
      const next = new Set(prev);
      for (const c of free.slice(0, 5)) next.add(c.id);
      return next;
    });
  }

  async function run(action: (ids: string[], lineId: string) => Promise<void>) {
    if (!activeLine || busy || ticked.size === 0) return;
    setBusy(true);
    try {
      await action([...ticked], activeLine);
      setTicked(new Set());
    } finally {
      setBusy(false);
    }
  }

  /**
   * Move past this batch without touching the cards. Skipping must not rate
   * them: an `Again` here would drop the card into the learning steps, which
   * is exactly the drilling triage exists to avoid.
   */
  function skipBatch() {
    setSkipped((n) => n + BATCH);
    setTicked(new Set());
  }

  if (isLoading || linesLoading) return <div className={page} />;

  const tickedHere = batch.filter((c) => ticked.has(c.id)).length;

  return (
    <div className={page}>
      <div className={topBar}>
        <div className={tabs}>
          <button
            className={mode === "triage" ? `${tab} ${tabOn}` : tab}
            onClick={() => {
              setMode("triage");
              setTicked(new Set());
            }}
          >
            Разбор
          </button>
          <button
            className={mode === "add" ? `${tab} ${tabOn}` : tab}
            onClick={() => {
              setMode("add");
              setTicked(new Set());
            }}
          >
            Добавить
          </button>
        </div>
        <LineSelector
          lines={lines}
          value={activeLine}
          onChange={setActiveLine}
        />
      </div>

      <div className={intro}>
        {mode === "triage" ? (
          <>
            Отметь те карточки, которые знаешь наверняка — они уйдут примерно на
            неделю вперёд, без разучивания. Остальные останутся нетронутыми и
            попадут в изучение позже, когда ты добавишь их сам.
          </>
        ) : (
          <>
            Отметь карточки, которые хочешь начать учить — они встанут в очередь
            и появятся на странице учёбы со всеми шагами разучивания.
          </>
        )}
      </div>

      {batch.length === 0 ? (
        <div className={empty}>
          {pool.length === 0 ? (
            <>
              Все карточки этой колоды уже в изучении.
              <br />
              <Link href="/learn">Вернуться к учёбе</Link>
            </>
          ) : (
            <>
              Разобрал всё, что было пролистано.
              <br />
              <button className={btn} onClick={() => setSkipped(0)}>
                Начать сначала ({pool.length})
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={list}>
            {batch.map((c) => {
              const on = ticked.has(c.id);
              return (
                <label key={c.id} className={on ? `${row} ${rowOn}` : row}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(c.id)}
                  />
                  <span className={texts}>
                    <span className={sideA}>{c.aCard}</span>
                    <span className={sideB}>{c.bCard}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className={actions}>
            <button className={btn} disabled={busy} onClick={addRandomFive}>
              +5 случайных
            </button>
            {ticked.size > 0 && (
              <button
                className={btn}
                disabled={busy}
                onClick={() => setTicked(new Set())}
              >
                Снять отметки
              </button>
            )}
            {mode === "triage" ? (
              <>
                <button
                  className={`${btn} ${primaryBtn}`}
                  disabled={busy || ticked.size === 0}
                  onClick={() => run(markKnown)}
                >
                  Знаю эти ({ticked.size})
                </button>
                <button className={btn} disabled={busy} onClick={skipBatch}>
                  Дальше →
                </button>
              </>
            ) : (
              <button
                className={`${btn} ${primaryBtn}`}
                disabled={busy || ticked.size === 0}
                onClick={() => run(introduce)}
              >
                Добавить в изучение ({ticked.size})
              </button>
            )}
            <span className={counter}>
              {mode === "triage"
                ? `${tickedHere} из ${batch.length} · осталось ${pool.length}`
                : `отмечено ${ticked.size} · всего ${pool.length}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
