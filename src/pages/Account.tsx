// The personal cabinet: who you are signed in as, what your collection looks
// like, and the lines you study it through. Line bookkeeping (create, rename,
// delete, pick the active one) lives here rather than in the Learn/Line header,
// which is for working *inside* one line.

import { useEffect, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import { mine, myCards } from "../lib/session";
import {
  useLines,
  useActiveLine,
  createLine,
  renameLine,
  deleteLine,
} from "../lib/lines";
import { isFresh, sortLine, dailyReviewStats } from "../lib/queue";
import { dueForecast } from "../lib/srs";
import { showCounter, setShowCounter } from "../lib/prefs";
import type { CardLog, QueuedCard } from "../lib/queue";
import type { SrsState } from "../lib/srs";

const page = css`
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
`;

const title = css`
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
`;

const section = css`
  margin-bottom: 2rem;
`;

const sectionHead = css`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
`;

const sectionTitle = css`
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #aaa;
`;

const sectionNote = css`
  font-size: 0.75rem;
  color: #bbb;
`;

const card = css`
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  background: #fff;
`;

const identity = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.9rem 1rem;
`;

const email = css`
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a1a1a;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
  font-family: inherit;
  cursor: pointer;
  color: #333;
  white-space: nowrap;

  &:hover {
    border-color: #1a1a1a;
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
  font-weight: 600;

  &:hover {
    background: #333;
  }
`;

const dangerBtn = css`
  color: #dc2626;

  &:hover {
    border-color: #dc2626;
  }
`;

const stats = css`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
  gap: 0.5rem;
`;

const stat = css`
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  background: #fff;
  padding: 0.7rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

const statValue = css`
  font-size: 1.25rem;
  font-weight: 700;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
`;

const statLabel = css`
  font-size: 0.7rem;
  color: #999;
`;

const daysLegend = css`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: #999;
`;

const daysBar = css`
  display: flex;
  gap: 0.25rem;
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
  justify-content: flex-end;
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

// One dot per card, in a column per day. Sized by viewBox, so it scales with
// the page and the dots stay round.
const swarm = css`
  display: block;
  width: 100%;
  height: auto;
  border-bottom: 1px solid #eee;
`;

const swarmLegend = css`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: #999;
`;

const swatch = css`
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
`;

const settingRow = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  font-size: 0.9rem;
  color: #1a1a1a;
  cursor: pointer;

  input {
    cursor: pointer;
  }
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

const lineRow = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }
`;

const lineName = css`
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a1a1a;
`;

const activeTag = css`
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #1a1a1a;
  border: 1px solid #1a1a1a;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
`;

const lineMeta = css`
  font-size: 0.75rem;
  color: #999;
  font-variant-numeric: tabular-nums;
`;

const input = css`
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  font-size: 0.9rem;
  font-family: inherit;
  min-width: 0;
  flex: 1 1 10rem;

  &:focus {
    outline: none;
    border-color: #1a1a1a;
  }
`;

const newLineForm = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
`;

const empty = css`
  padding: 1.5rem 1rem;
  text-align: center;
  color: #999;
  font-size: 0.85rem;
`;

interface AccountCard extends QueuedCard {
  id: string;
  log?: CardLog;
  srs?: SrsState;
}

/** FSRS difficulty (1..10) as green→red. */
function difficultyColor(d: number): string {
  const t = Math.min(1, Math.max(0, (d - 1) / 9));
  return `hsl(${150 - t * 150} 62% ${58 - t * 10}%)`;
}

// The chart is drawn to this width and stretched to the column, so a smaller
// number means bigger bricks. Halved on a phone, where 720 units squeezed into
// a 360px screen made them illegible.
const PHONE = "(max-width: 540px)";
const chartWidth = () => (window.matchMedia(PHONE).matches ? 360 : 720);
// Ten bricks to a column, so a day can be counted in tens at a glance.
const ROWS = 10;
const BRICK_H = 5;
const ROW_PITCH = 7;
// A gap after every fifth brick, which is what makes ten countable.
const GROUP_GAP = 2;
// Days are set apart by three times that, so the split between two days always
// reads stronger than the split inside a column.
const DAY_GAP = GROUP_GAP * 5;
const H = ROWS * ROW_PITCH + GROUP_GAP;

/**
 * A brick per card over the days ahead, coloured by how hard the card is.
 * Bricks stack ten to a column and the columns run left to right, so height
 * reads as "up to ten" and width as how many tens. Each day is only as wide as
 * its own cards need — a quiet day is a narrow sliver, a heavy one a wide slab.
 */
function Swarm({ days }: { days: { date: Date; cards: AccountCard[] }[] }) {
  const [W, setW] = useState(chartWidth);
  // Rotating the phone crosses the breakpoint, and nothing else re-renders.
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const sync = () => setW(chartWidth());
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // An empty day still gets one column's worth of room, so the run of days
  // stays legible instead of collapsing into one gap.
  const colsOf = (n: number) => Math.max(1, Math.ceil(n / ROWS));
  const totalCols = days.reduce((sum, d) => sum + colsOf(d.cards.length), 0);
  const pitch = Math.min(
    6,
    (W - DAY_GAP * (days.length - 1)) / Math.max(1, totalCols),
  );
  const w = Math.max(0.8, pitch - 0.8);
  let x0 = 0;

  return (
    <svg
      className={swarm}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Cards due over the next ${days.length} days, one brick per card`}
    >
      {days.map((day) => {
        const x = x0;
        const dayW = colsOf(day.cards.length) * pitch;
        x0 += dayW + DAY_GAP;
        // Sorted so a column reads as a gradient: the hard cards sink.
        const sorted = [...day.cards].sort(
          (a, b) => (b.srs?.difficulty ?? 0) - (a.srs?.difficulty ?? 0),
        );
        return (
          <g key={+day.date}>
            {sorted.map((c, k) => {
              const row = k % ROWS;
              return (
                <rect
                  key={c.id}
                  x={x + Math.floor(k / ROWS) * pitch}
                  y={H - BRICK_H - row * ROW_PITCH - (row >= 5 ? GROUP_GAP : 0)}
                  width={w}
                  height={BRICK_H}
                  rx={0.6}
                  fill={difficultyColor(c.srs?.difficulty ?? 5)}
                />
              );
            })}
            <rect
              x={x}
              y={0}
              width={dayW + DAY_GAP}
              height={H}
              fill="transparent"
            >
              <title>{`${day.date.toLocaleDateString()} — ${day.cards.length}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

export default function Account() {
  const { user } = db.useAuth();
  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);
  // Which line is being renamed, and the draft name for it.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [counterOn, setCounterOn] = useState(showCounter);

  // Everything on this page is a count over the same three collections, so they
  // are fetched once here rather than per section.
  const { data, isLoading } = db.useQuery({
    cards: { $: { where: myCards(), limit: 5000 } },
    examples: { $: { where: mine(), limit: 5000 } },
    lightCards: { $: { where: mine(), limit: 5000 } },
  });

  const cards = (data?.cards ?? []) as AccountCard[];
  const exampleCount = data?.examples?.length ?? 0;
  const grammarCount = data?.lightCards?.length ?? 0;
  // Study activity across every line, the strip that used to sit on the Line page.
  const days = dailyReviewStats(cards, 14);
  // And what is coming: how the scheduler spread the collection over the days
  // ahead, so a wall of repeats is visible before you walk into it. A card in
  // no line keeps its schedule but is never served, so it is not work ahead.
  const forecast = dueForecast(
    cards.filter((c) => Object.keys(c.queues ?? {}).length > 0),
    14,
  );

  function lineStats(lineId: string) {
    const members = sortLine(cards, lineId);
    return {
      total: members.length,
      fresh: members.filter((c) => isFresh(c.log)).length,
    };
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    const lineId = await createLine(name);
    // A line you just made is the one you meant to study.
    setActiveLine(lineId);
  }

  async function handleRename(lineId: string) {
    const name = draft.trim();
    setEditing(null);
    if (name) await renameLine(lineId, name);
  }

  async function handleDelete(lineId: string, name: string) {
    const { total } = lineStats(lineId);
    const ok = window.confirm(
      `Delete line "${name}"? Its ${total} ${total === 1 ? "card stays" : "cards stay"}, but their place in this line is lost.`,
    );
    if (ok) await deleteLine(lineId);
  }

  return (
    <div className={page}>
      <h1 className={title}>Account</h1>

      <section className={section}>
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Signed in</h2>
        </div>
        <div className={card}>
          <div className={identity}>
            <span className={email} title={user?.email}>
              {user?.email}
            </span>
            <span className={spacer} />
            <button className={smallBtn} onClick={() => db.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </section>

      <section className={section}>
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Collection</h2>
        </div>
        <div className={stats}>
          <div className={stat}>
            <span className={statValue}>{isLoading ? "—" : cards.length}</span>
            <span className={statLabel}>cards</span>
          </div>
          <div className={stat}>
            <span className={statValue}>{isLoading ? "—" : exampleCount}</span>
            <span className={statLabel}>examples</span>
          </div>
          <div className={stat}>
            <span className={statValue}>{isLoading ? "—" : grammarCount}</span>
            <span className={statLabel}>grammar notes</span>
          </div>
          <div className={stat}>
            <span className={statValue}>
              {linesLoading ? "—" : lines.length}
            </span>
            <span className={statLabel}>lines</span>
          </div>
        </div>
      </section>

      <section className={section}>
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Last 14 days</h2>
          <span className={spacer} />
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
            if (isLoading || d.total === 0) cls.push(dayEmpty);
            return (
              <div
                key={d.date.getTime()}
                className={cls.join(" ")}
                title={`${d.date.toLocaleDateString()} — ${d.unique} unique, ${d.total} total`}
              >
                <span className={dayUnique}>{isLoading ? "—" : d.unique}</span>
                <span className={dayTotal}>{isLoading ? "" : d.total}</span>
                <span className={dayLabel}>{d.date.getDate()}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={section}>
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Next 14 days</h2>
          <span className={spacer} />
          <span className={swarmLegend}>
            <span
              className={swatch}
              style={{ background: difficultyColor(1) }}
            />
            easy
            <span
              className={swatch}
              style={{ background: difficultyColor(10) }}
            />
            hard
          </span>
        </div>
        <Swarm days={forecast} />
        <div className={dayLabel}>today</div>
      </section>

      <section className={section}>
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Learn</h2>
        </div>
        <div className={card}>
          <label className={settingRow}>
            <input
              type="checkbox"
              checked={counterOn}
              onChange={(e) => {
                setShowCounter(e.target.checked);
                setCounterOn(e.target.checked);
              }}
            />
            Show counters on Learn: studied today, still due
          </label>
        </div>
      </section>

      <section className={section}>
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Lines</h2>
          <span className={sectionNote}>
            The active line is what Learn and Line open on.
          </span>
        </div>
        <div className={card}>
          {linesLoading ? (
            <div className={empty}>…</div>
          ) : (
            lines.length === 0 && (
              <div className={empty}>
                No lines yet — create one to start a queue.
              </div>
            )
          )}
          {lines.map((l) => {
            const { total, fresh } = lineStats(l.id);
            const isActive = l.id === activeLine;
            if (editing === l.id) {
              return (
                <div key={l.id} className={lineRow}>
                  <input
                    className={input}
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(l.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <button
                    className={`${smallBtn} ${primaryBtn}`}
                    onClick={() => handleRename(l.id)}
                  >
                    Save
                  </button>
                  <button className={smallBtn} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              );
            }
            return (
              <div key={l.id} className={lineRow}>
                <span className={lineName}>{l.name}</span>
                {isActive && <span className={activeTag}>active</span>}
                <span className={lineMeta}>
                  {isLoading
                    ? "…"
                    : `${total} ${total === 1 ? "card" : "cards"}${
                        fresh > 0 ? ` · ${fresh} new` : ""
                      }`}
                </span>
                <span className={spacer} />
                {!isActive && (
                  <button
                    className={smallBtn}
                    onClick={() => setActiveLine(l.id)}
                  >
                    Make active
                  </button>
                )}
                <button
                  className={smallBtn}
                  onClick={() => {
                    setDraft(l.name);
                    setEditing(l.id);
                  }}
                >
                  Rename
                </button>
                <button
                  className={`${smallBtn} ${dangerBtn}`}
                  onClick={() => handleDelete(l.id, l.name)}
                >
                  Delete
                </button>
              </div>
            );
          })}
          <div className={newLineForm}>
            <input
              className={input}
              placeholder="New line name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <button
              className={`${smallBtn} ${primaryBtn}`}
              onClick={handleCreate}
              disabled={!newName.trim()}
            >
              Create
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
