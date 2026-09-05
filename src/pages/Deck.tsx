import { useState } from "react";
import { css } from "@linaria/core";
import { Link } from "wouter";
import { db } from "../db";
import { myCards } from "../lib/session";
import { useLines, useActiveLine } from "../lib/lines";
import { newPool, introduce, type SrsState } from "../lib/srs";
import LineSelector from "../components/LineSelector";

// Everything that hasn't been taken into study yet, and the way in: tick a
// themed handful and send it to learn. The whole pool shows at once, because
// picking by theme means seeing all of it.

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

const title = css`
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
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
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);

  const { data, isLoading } = db.useQuery({
    cards: { $: { where: myCards(), limit: 5000 } },
  });

  const cards = (data?.cards ?? []) as DeckCard[];
  const pool = activeLine ? newPool(cards, activeLine) : [];

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
    const free = pool.filter((c) => !ticked.has(c.id));
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

  if (isLoading || linesLoading) return <div className={page} />;

  return (
    <div className={page}>
      <div className={topBar}>
        <h1 className={title}>Backlog</h1>
        <LineSelector
          lines={lines}
          value={activeLine}
          onChange={setActiveLine}
        />
      </div>

      <div className={intro}>
        Отметь карточки, которые хочешь начать учить — они встанут в очередь и
        появятся на странице учёбы со всеми шагами разучивания.
      </div>

      {pool.length === 0 ? (
        <div className={empty}>
          Все карточки этой колоды уже в изучении.
          <br />
          <Link href="/learn">Вернуться к учёбе</Link>
        </div>
      ) : (
        <>
          <div className={list}>
            {pool.map((c) => {
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
            <button
              className={`${btn} ${primaryBtn}`}
              disabled={busy || ticked.size === 0}
              onClick={() => run(introduce)}
            >
              Добавить в изучение ({ticked.size})
            </button>
            <span className={counter}>
              отмечено {ticked.size} · всего {pool.length}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
