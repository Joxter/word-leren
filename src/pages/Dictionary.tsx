import { useEffect, useMemo, useRef, useState } from "react";
import { css } from "@linaria/core";
import { id } from "@instantdb/react";
import { db } from "../db";
import { enqueueTop, moveToTop, sortLine, type CardLog } from "../lib/queue";
import { getDefaultLineId, useLines } from "../lib/lines";
import {
  loadDictionary,
  searchDictionary,
  entryAudios,
  type DictEntry,
} from "../lib/dictionary";
import { mergeContained } from "../lib/translations";
import { rankMatches } from "../lib/search";
import CardModal from "../components/CardModal";
import PlayButton from "../components/PlayButton";
import { saveCard, deleteCard } from "../lib/cards";
import type { Card, CardData } from "./Cards";

/** A card as loaded here — the queue helpers also want its `log`. */
type CardWithLog = Card & { log?: CardLog };

/** Search the user's own cards: side A, then side B, then the note. */
function searchCards(
  cards: CardWithLog[],
  rawQuery: string,
  limit = 20,
): CardWithLog[] {
  return rankMatches(cards, rawQuery, {
    fields: (c) => [c.aCard, c.bCard, c.note],
    label: (c) => c.aCard,
    limit,
  });
}

const page = css`
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const search = css`
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  outline: none;
  position: sticky;
  top: 1rem;
  background: #fff;

  &:focus {
    border-color: #1a1a1a;
  }
`;

const hint = css`
  text-align: center;
  color: #999;
  padding: 3rem 0;
  font-size: 0.875rem;
`;

const list = css`
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin-top: 1.25rem;
`;

const card = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  padding: 0.875rem 1rem;
`;

const head = css`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const word = css`
  font-size: 1.125rem;
  font-weight: 600;
`;

const article = css`
  font-size: 1.125rem;
  font-weight: 600;
  color: #999;
`;

const pos = css`
  font-size: 0.8125rem;
  color: #999;
`;

const audioRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.6rem;
`;

const playBtn = css`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid #e5e5e5;
  background: #fafafa;
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: #555;
  cursor: pointer;

  &:hover {
    border-color: #aaa;
    color: #111;
  }
`;

const verbLine = css`
  font-size: 0.8125rem;
  color: #444;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: baseline;
`;

const verbTag = css`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #b06a1c;
  background: #fbf1e3;
  border-radius: 5px;
  padding: 0.05rem 0.35rem;
`;

// Each content group (translations / verb / examples) sits under a thin divider.
const section = css`
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
`;

const transRow = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.9375rem;
  color: #1a1a1a;

  & + & {
    margin-top: 0.3rem;
  }
`;

// Gray source label shown at the end of a translation / example row.
const srcEnd = css`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #bbb;
  white-space: nowrap;
  flex-shrink: 0;
`;

const verbLabel = css`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #999;
  margin-right: 0.25rem;
`;

const addBtn = css`
  margin-left: auto;
  border: 1px solid #e5e5e5;
  background: #fafafa;
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  color: #555;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    border-color: #1a1a1a;
    color: #111;
  }

  &:disabled {
    cursor: default;
    border-color: #cfe8d4;
    background: #f0f9f1;
    color: #2c7a3f;
  }
`;

const exampleRow = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;

  & + & {
    margin-top: 0.5rem;
  }
`;

const exampleText = css`
  font-size: 0.8125rem;
  color: #555;
  line-height: 1.45;

  p {
    margin: 0;
    white-space: pre-line;
  }

  p + p {
    color: #9a9a9a;
  }
`;

// --- Matching existing cards, listed above the dictionary results ----------

const hitList = css`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1.25rem;
`;

const hitRow = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;

  @media (max-width: 540px) {
    flex-wrap: wrap;
    gap: 0.4rem 0.6rem;
  }
`;

const hitSides = css`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
`;

// Side A keeps its width as long as it can; side B is the one that gives way.
const hitA = css`
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 0;
  max-width: 60%;
`;

const hitB = css`
  font-size: 0.875rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

// Current 1-indexed position in the default line, or "not in line".
const posTag = css`
  flex-shrink: 0;
  font-size: 0.6875rem;
  color: #888;
  background: #f4f4f4;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  white-space: nowrap;
`;

const hitActions = css`
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
  margin-left: auto;
`;

const hitBtn = css`
  border: 1px solid #e5e5e5;
  background: #fafafa;
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  color: #555;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    border-color: #1a1a1a;
    color: #111;
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

function play(audio: HTMLAudioElement | null, url: string) {
  if (!audio) return;
  audio.src = url;
  audio.play().catch(() => {});
}

function EntryCard({
  entry,
  audioEl,
}: {
  entry: DictEntry;
  audioEl: HTMLAudioElement | null;
}) {
  const audios = entryAudios(entry);
  const verb = entry.verb;

  // Translations grouped by content: identical ones (case-insensitive) merge
  // into one row that lists every source for them, in gray at the end. Then
  // translations fully contained in a longer one collapse into it, so "lock"
  // and "the lock" become just "the lock".
  const transMap = new Map<string, { text: string; sources: string[] }>();
  for (const info of entry.info) {
    const text = info.translation?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const existing = transMap.get(key);
    if (existing) existing.sources.push(info.source);
    else transMap.set(key, { text, sources: [info.source] });
  }
  const translations = mergeContained([...transMap.values()]);

  const examplesList = entry.info
    .filter((i) => i.examples)
    .map((i) => ({ examples: i.examples as string, source: i.source }));

  // Whether the word is already a card isn't checked here — matching cards show
  // up in their own section above the dictionary results.
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);

  async function addToCards() {
    setSaving(true);
    const cardId = id();
    const note = examplesList.map((e) => e.examples).join("\n\n");
    // entry.info[].audio is stored as "dict/<file>.mp3"; the card keeps the full
    // path from public/ so it can be played directly. Prefer a clip from the
    // "common" source, falling back to the first info that has any audio.
    const rawAudio = (
      entry.info.find((i) => i.audio && i.source === "common") ??
      entry.info.find((i) => i.audio)
    )?.audio;
    await db.transact(
      db.tx.cards[cardId].update({
        aLang: "NL",
        bLang: "EN",
        aCard: entry.article ? `${entry.article} ${entry.word}` : entry.word,
        bCard: translations.map((t) => t.text).join(", "),
        note,
        ...(rawAudio ? { audio: `audio/${rawAudio}` } : {}),
      }),
    );
    // New card jumps to the top of the default line, like cards added from the
    // Cards page.
    await enqueueTop(await getDefaultLineId(), cardId);
    setAdded(true);
    setSaving(false);
  }

  return (
    <div className={card}>
      <div className={head}>
        {entry.article && <span className={article}>{entry.article}</span>}
        <span className={word}>{entry.word}</span>
        {entry.pos && <span className={pos}>{entry.pos}</span>}
        <button
          className={addBtn}
          onClick={addToCards}
          disabled={added || saving || translations.length === 0}
          title="Add to cards (NL → EN)"
        >
          {added ? "✓ Added" : saving ? "Adding…" : "+ Add to cards"}
        </button>
      </div>

      {translations.length > 0 && (
        <div className={section}>
          {translations.map((t, i) => (
            <div className={transRow} key={i}>
              <span>{t.text}</span>
              <span className={srcEnd}>{t.sources.join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      {verb && (verb.past || verb.participle || verb.separable) && (
        <div className={section}>
          <div className={verbLine}>
            {verb.separable && <span className={verbTag}>separable</span>}
            {verb.past && (
              <span>
                <span className={verbLabel}>past</span>
                {verb.past}
              </span>
            )}
            {verb.participle && (
              <span>
                <span className={verbLabel}>participle</span>
                {verb.participle}
              </span>
            )}
          </div>
        </div>
      )}

      {examplesList.length > 0 && (
        <div className={section}>
          {examplesList.map((ex, i) => (
            <div className={exampleRow} key={i}>
              <div className={exampleText}>
                {ex.examples.split("—").map((line, j) => (
                  <p key={j}>{line.trim()}</p>
                ))}
              </div>
              <span className={srcEnd}>{ex.source}</span>
            </div>
          ))}
        </div>
      )}

      {audios.length > 0 && (
        <div className={audioRow}>
          {audios.map((a) => (
            <button
              key={a.url}
              className={playBtn}
              onClick={() => play(audioEl, a.url)}
              title={`Play (${a.source})`}
            >
              ▶ {a.source}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One matching existing card, with shortcuts to edit it or re-top it. */
function CardHit({
  card,
  position,
  onEdit,
  onTop,
}: {
  card: CardWithLog;
  position: number | undefined;
  onEdit: () => void;
  onTop: () => Promise<void>;
}) {
  const [topping, setTopping] = useState(false);

  async function handleTop() {
    setTopping(true);
    try {
      await onTop();
    } finally {
      setTopping(false);
    }
  }

  return (
    <div className={hitRow}>
      <div className={hitSides}>
        <span className={hitA}>{card.aCard}</span>
        {card.audio && <PlayButton path={card.audio} small />}
        <span className={hitB}>{card.bCard}</span>
      </div>
      <span className={posTag}>
        {position ? `#${position}` : "not in line"}
      </span>
      <div className={hitActions}>
        <button className={hitBtn} onClick={onEdit}>
          Edit
        </button>
        <button
          className={hitBtn}
          onClick={handleTop}
          disabled={topping}
          title="Move to the top of the line"
        >
          {topping ? "…" : "↑ Top"}
        </button>
      </div>
    </div>
  );
}

export default function Dictionary() {
  const [entries, setEntries] = useState<DictEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modalCard, setModalCard] = useState<CardWithLog | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { lines } = useLines();
  const lineId = lines[0]?.id ?? null;

  const { data: cardsData } = db.useQuery({ cards: { image: {} } });
  const allCards = useMemo(
    () => (cardsData?.cards ?? []) as CardWithLog[],
    [cardsData?.cards],
  );

  // The default line, sorted top -> bottom: used both for the position badge
  // and as the `members` argument `moveToTop` needs.
  const lineMembers = useMemo(
    () => (lineId ? sortLine(allCards, lineId) : []),
    [allCards, lineId],
  );
  const positions = useMemo(
    () => new Map(lineMembers.map((c, i) => [c.id, i + 1])),
    [lineMembers],
  );

  const cardHits = useMemo(
    () => searchCards(allCards, query),
    [allCards, query],
  );

  async function handleUpdate(
    formData: CardData,
    imageFile: File | null,
    removeImageId: string | null,
  ): Promise<void> {
    await saveCard(modalCard!.id, formData, imageFile, removeImageId);
    setModalCard(null);
  }

  function handleDelete(cardId: string) {
    deleteCard(cardId);
    setModalCard(null);
  }

  useEffect(() => {
    audioRef.current = new Audio();
    loadDictionary()
      .then(setEntries)
      .catch((e) => setError(String(e)));
  }, []);

  const results = useMemo(
    () => (entries ? searchDictionary(entries, query) : []),
    [entries, query],
  );

  const trimmed = query.trim();

  return (
    <div className={page}>
      <input
        className={search}
        placeholder="Search Dutch or English…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />

      {error && <div className={hint}>{error}</div>}
      {!entries && !error && <div className={hint}>Loading dictionary…</div>}
      {entries && trimmed === "" && (
        <div className={hint}>
          Type a word to search {entries.length.toLocaleString()} entries.
        </div>
      )}
      {entries &&
        trimmed !== "" &&
        results.length === 0 &&
        cardHits.length === 0 && (
          <div className={hint}>No matches for “{trimmed}”.</div>
        )}

      {cardHits.length > 0 && (
        <div className={hitList}>
          {cardHits.map((c) => (
            <CardHit
              key={c.id}
              card={c}
              position={positions.get(c.id)}
              onEdit={() => setModalCard(c)}
              onTop={async () => {
                if (lineId) await moveToTop(lineMembers, lineId, c.id);
              }}
            />
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className={list}>
          {results.map((entry, i) => (
            <EntryCard
              key={`${entry.word}-${i}`}
              entry={entry}
              audioEl={audioRef.current}
            />
          ))}
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
