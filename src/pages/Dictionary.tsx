import { useEffect, useMemo, useRef, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import { moveToTop, sortLine, type CardLog } from "../lib/queue";
import { useLines } from "../lib/lines";
import {
  loadDictionary,
  searchDictionary,
  cardRuns,
  entryAudios,
  entryCardBack,
  entryTranslations,
  deckInfo,
  findOwnCard,
  senseGroups,
  WIKTIONARY,
  type DictEntry,
} from "../lib/dictionary";
import { rankMatches } from "../lib/search";
import { liveLinks, type Example } from "../lib/examples";
import CardModal from "../components/CardModal";
import PlayButton from "../components/PlayButton";
import { createCardFromEntry, saveCard, deleteCard } from "../lib/cards";
import { mine, myCards } from "../lib/session";
import type { Card, CardData } from "./Cards";

/** A card as loaded here — the queue helpers also want its `log`. */
type CardWithLog = Card & { log?: CardLog };

/**
 * Search the user's own cards: side A, then side B, then the note. Unlimited —
 * the section header counts every hit, and the list caps what it renders.
 */
function searchCards(cards: CardWithLog[], rawQuery: string): CardWithLog[] {
  return rankMatches(cards, rawQuery, {
    fields: (c) => [c.aCard, c.bCard, c.note],
    label: (c) => c.aCard,
  });
}

/** The words an example is attached to, for both its search text and its row. */
function exampleCards(example: Example): string[] {
  return liveLinks(example).flatMap((l) => (l.card ? [l.card.aCard] : []));
}

/** Search shared example sentences: the Dutch, then the translation, then the
 *  cards they hang off — searching for a word should find its sentences. */
function searchExamples(examples: Example[], rawQuery: string): Example[] {
  return rankMatches(examples, rawQuery, {
    fields: (e) => [e.aText, e.bText, exampleCards(e).join(" ")],
    label: (e) => e.aText,
  });
}

type Tab = "dictionary" | "cards" | "examples";

/** How many hits a section renders at once, however many it found. */
const RENDER_LIMIT = 60;

const page = css`
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
`;

// --- Result sections -------------------------------------------------------

// One row of tabs, each carrying its own count so the sections that aren't
// open still say whether they have anything. Scrolls sideways rather than
// wrapping on a narrow phone, which would push the results down a line.
const tabs = css`
  display: flex;
  gap: 0.375rem;
  margin-top: 1rem;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const tabBtn = css`
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  border: 1px solid #e5e5e5;
  background: #fff;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font-size: 0.8125rem;
  color: #666;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    border-color: #bbb;
    color: #1a1a1a;
  }
`;

const tabActive = css`
  border-color: #1a1a1a;
  background: #1a1a1a;
  color: #fff;

  &:hover {
    border-color: #1a1a1a;
    color: #fff;
  }
`;

const tabCount = css`
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.65;
`;

// "Showing 60 of 214" under a section that renders only its first page.
const moreHint = css`
  margin-top: 0.75rem;
  text-align: center;
  font-size: 0.75rem;
  color: #aaa;
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

// The badge and the button travel together at the end of the header row.
const headEnd = css`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

// "You already have this one." Not a disabled state: a second card for the same
// word is sometimes the point (a different sense, a fixed expression).
const haveBadge = css`
  border: 1px solid #cfe8d4;
  background: #f0f9f1;
  border-radius: 6px;
  padding: 0.2rem 0.4rem;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #2c7a3f;
  white-space: nowrap;
  cursor: default;
`;

const addBtn = css`
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

// --- Wiktionary senses ------------------------------------------------------

// One part of speech and its numbered meanings.
const senseGroup = css`
  & + & {
    margin-top: 0.7rem;
  }
`;

// The heading carries the source label, so the senses under it don't each have
// to repeat it.
const senseHead = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.3rem;
`;

const sensePos = css`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #999;
  font-weight: 600;
`;

const senseList = css`
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.9375rem;
  color: #1a1a1a;

  li {
    margin: 0;
  }

  li + li {
    margin-top: 0.35rem;
  }

  li::marker {
    color: #bbb;
    font-size: 0.8125rem;
  }
`;

// A sense's own example sentences, indented under the meaning they belong to.
// Second line of an example is its translation, dimmed like the deck examples.
const senseExample = css`
  font-size: 0.8125rem;
  color: #666;
  line-height: 1.45;
  margin-top: 0.15rem;

  p {
    margin: 0;
    white-space: pre-line;
  }

  p + p {
    color: #9a9a9a;
  }
`;

const synRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.2rem;
`;

const synChip = css`
  font-size: 0.75rem;
  color: #4a6b52;
  background: #f1f7f2;
  border: 1px solid #e0ece2;
  border-radius: 4px;
  padding: 0.05rem 0.35rem;
`;

const moreBtn = css`
  margin-top: 0.5rem;
  border: none;
  background: none;
  padding: 0;
  font-size: 0.75rem;
  color: #888;
  cursor: pointer;
  text-decoration: underline;

  &:hover {
    color: #1a1a1a;
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

// One line on a desktop. On a phone it becomes a two-row grid — sides and
// position badge across the top, buttons under them — because squeezing all
// four onto one line left both sides of the card as ellipses.
const hitRow = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;

  @media (max-width: 540px) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
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

  /* Stacked, and free to wrap: on a phone the point is to read the card. */
  @media (max-width: 540px) {
    flex-direction: column;
    gap: 0.15rem;
    overflow: visible;
  }
`;

// Side A and its play button stay together when the sides stack. The cap lives
// here rather than on side A itself: as a percentage of a shrink-to-fit inline
// flex box it would resolve against the word's own width and clip it at any
// row width at all.
const hitTop = css`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex-shrink: 0;
  max-width: 60%;

  /* The play button is not what should give way inside the group. */
  & > button {
    flex-shrink: 0;
  }

  @media (max-width: 540px) {
    max-width: 100%;
  }
`;

// Side A keeps its width as long as it can; side B is the one that gives way,
// and side A only ellipsises once the group above hits its cap.
const hitA = css`
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;

  @media (max-width: 540px) {
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
  }
`;

const hitB = css`
  font-size: 0.875rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;

  @media (max-width: 540px) {
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
  }
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

  @media (max-width: 540px) {
    justify-self: end;
  }
`;

const hitActions = css`
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
  margin-left: auto;

  @media (max-width: 540px) {
    grid-column: 1 / -1;
    justify-content: flex-end;
    margin-left: 0;
  }
`;

// --- Matching examples -----------------------------------------------------

const exHit = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9375rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

const exTrans = css`
  font-size: 0.875rem;
  color: #777;
  margin-top: 0.1rem;
`;

// The cards this sentence is attached to — the reason it is worth finding.
const exCards = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.35rem;
`;

const exCard = css`
  font-size: 0.75rem;
  color: #555;
  background: #f4f4f4;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
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

/** How many Wiktionary senses an entry shows before "show all". */
const SENSE_LIMIT = 4;

function EntryCard({
  entry,
  audioEl,
  ownCard,
}: {
  entry: DictEntry;
  audioEl: HTMLAudioElement | null;
  // A card the user already has for this word, if any.
  ownCard: CardWithLog | null;
}) {
  const audios = entryAudios(entry);
  const verb = entry.verb;
  const decks = deckInfo(entry);

  // Merged for reading: identical translations collapse into one row that
  // lists every source for them, in gray at the end.
  const translations = entryTranslations(entry);

  const examplesList = decks
    .filter((i) => i.examples)
    .map((i) => ({ examples: i.examples as string, source: i.source }));

  // Wiktionary senses, capped until asked for: a preposition like "aan" has 17
  // of them, which is a page of reading in front of everything else.
  const [allSenses, setAllSenses] = useState(false);
  const groups = senseGroups(entry);
  const senseCount = groups.reduce((n, g) => n + g.senses.length, 0);
  const shownGroups: typeof groups = [];
  let budget = allSenses ? Infinity : SENSE_LIMIT;
  for (const g of groups) {
    if (budget <= 0) break;
    const senses = g.senses.slice(0, budget);
    budget -= senses.length;
    shownGroups.push({ ...g, senses });
  }

  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);

  // What side B of the card would say — empty means there is nothing to put on
  // it, which is what the Add button refuses on.
  const cardBack = entryCardBack(entry);

  async function addToCards() {
    setSaving(true);
    try {
      await createCardFromEntry(entry);
      setAdded(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={card}>
      <div className={head}>
        {entry.article && <span className={article}>{entry.article}</span>}
        <span className={word}>{entry.word}</span>
        {entry.pos && <span className={pos}>{entry.pos}</span>}
        <span className={headEnd}>
          {ownCard && !added && (
            <span
              className={haveBadge}
              title={`Already a card: ${ownCard.aCard}`}
            >
              ✓ in cards
            </span>
          )}
          <button
            className={addBtn}
            onClick={addToCards}
            disabled={added || saving || cardBack === ""}
            title="Add to cards (NL → EN)"
          >
            {added ? "✓ Added" : saving ? "Adding…" : "+ Add to cards"}
          </button>
        </span>
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

      {shownGroups.length > 0 && (
        <div className={section}>
          {shownGroups.map((group, gi) => (
            <div className={senseGroup} key={group.pos ?? gi}>
              <div className={senseHead}>
                <span className={sensePos}>{group.pos ?? "meanings"}</span>
                {gi === 0 && <span className={srcEnd}>{WIKTIONARY}</span>}
              </div>
              <ol className={senseList}>
                {group.senses.map((sense, si) => (
                  <li key={si}>
                    {sense.translation}
                    {/* Examples are separated by a blank line; the second
                        line of one, when there is one, is its translation. */}
                    {sense.examples?.split("\n\n").map((ex, ei) => (
                      <div className={senseExample} key={ei}>
                        {ex.split("\n").map((line, li) => (
                          <p key={li}>{line}</p>
                        ))}
                      </div>
                    ))}
                    {sense.synonyms && sense.synonyms.length > 0 && (
                      <div className={synRow}>
                        {sense.synonyms.map((s) => (
                          <span className={synChip} key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {senseCount > SENSE_LIMIT && (
            <button
              className={moreBtn}
              onClick={() => setAllSenses((v) => !v)}
              type="button"
            >
              {allSenses ? "Show fewer" : `Show all ${senseCount} meanings`}
            </button>
          )}
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
            {verb.pastPl && (
              <span>
                <span className={verbLabel}>past pl</span>
                {verb.pastPl}
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
        <span className={hitTop}>
          <span className={hitA}>{card.aCard}</span>
          {card.audio && <PlayButton path={card.audio} small />}
        </span>
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
  const [tab, setTab] = useState<Tab>("dictionary");
  const [modalCard, setModalCard] = useState<CardWithLog | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { lines } = useLines();
  const lineId = lines[0]?.id ?? null;

  const { data: cardsData } = db.useQuery({
    cards: { image: {}, $: { where: myCards() } },
    examples: { links: { card: {} }, $: { where: mine(), limit: 2000 } },
  });
  const allCards = useMemo(
    () => (cardsData?.cards ?? []) as CardWithLog[],
    [cardsData?.cards],
  );
  const allExamples = useMemo(
    () => (cardsData?.examples ?? []) as Example[],
    [cardsData?.examples],
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

  // Side A of every card, prepared once, so each dictionary result can ask
  // whether it is already one of them.
  const runs = useMemo(() => cardRuns(allCards), [allCards]);

  const cardHits = useMemo(
    () => searchCards(allCards, query),
    [allCards, query],
  );
  const exampleHits = useMemo(
    () => searchExamples(allExamples, query),
    [allExamples, query],
  );

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

  useEffect(() => {
    audioRef.current = new Audio();
    loadDictionary()
      .then(setEntries)
      .catch((e) => setError(String(e)));
  }, []);

  // Unlimited, like the other two: the tab counts every hit and the list caps
  // what it renders. Left at the default, the count would read a flat "60".
  const results = useMemo(
    () => (entries ? searchDictionary(entries, query, Infinity) : []),
    [entries, query],
  );

  const trimmed = query.trim();

  // What the open section has, and what all three have between them — the
  // second is what tells "nothing anywhere" apart from "nothing under this tab".
  const shown = {
    count:
      tab === "dictionary"
        ? results.length
        : tab === "cards"
          ? cardHits.length
          : exampleHits.length,
    total: results.length + cardHits.length + exampleHits.length,
  };

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
      {!entries && !error && trimmed === "" && (
        <div className={hint}>Loading dictionary…</div>
      )}
      {entries && trimmed === "" && (
        <div className={hint}>
          Type a word to search {entries.length.toLocaleString()} entries.
        </div>
      )}

      {/* All three sections are offered with their counts whichever is open: a
          query that misses the dictionary often hits the cards, and the count
          is what says so without a click. They appear as soon as anything is
          typed rather than once the dictionary has downloaded — cards and
          examples are already in memory, and on a phone that 3.5 MB fetch is
          long enough to matter. */}
      {trimmed !== "" && (
        <>
          <div className={tabs}>
            {(
              [
                ["dictionary", "Dictionary", entries ? results.length : "…"],
                ["cards", "Cards", cardHits.length],
                ["examples", "Examples", exampleHits.length],
              ] as const
            ).map(([key, title, count]) => (
              <button
                key={key}
                type="button"
                className={tab === key ? `${tabBtn} ${tabActive}` : tabBtn}
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
              >
                {title}
                <span className={tabCount}>{count}</span>
              </button>
            ))}
          </div>

          {tab === "dictionary" && !entries && !error && (
            <div className={hint}>Loading dictionary…</div>
          )}

          {shown.count === 0 && (entries || tab !== "dictionary") && (
            <div className={hint}>
              {shown.total === 0
                ? `No matches for “${trimmed}”.`
                : `Nothing here for “${trimmed}”.`}
            </div>
          )}

          {
            <>
              {tab === "cards" && (
                <div className={hitList}>
                  {cardHits.slice(0, RENDER_LIMIT).map((c) => (
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

              {tab === "dictionary" && (
                <div className={list}>
                  {results.slice(0, RENDER_LIMIT).map((entry, i) => (
                    <EntryCard
                      key={`${entry.word}-${i}`}
                      entry={entry}
                      audioEl={audioRef.current}
                      ownCard={findOwnCard(runs, entry.word)}
                    />
                  ))}
                </div>
              )}

              {tab === "examples" && (
                <div className={hitList}>
                  {exampleHits.slice(0, RENDER_LIMIT).map((e) => {
                    const words = exampleCards(e);
                    return (
                      <div className={exHit} key={e.id}>
                        <div>{e.aText}</div>
                        {e.bText?.trim() && (
                          <div className={exTrans}>{e.bText}</div>
                        )}
                        {words.length > 0 && (
                          <div className={exCards}>
                            {words.map((word, i) => (
                              <span className={exCard} key={i}>
                                {word}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {shown.count > RENDER_LIMIT && (
                <div className={moreHint}>
                  Showing {RENDER_LIMIT} of {shown.count}
                </div>
              )}
            </>
          }
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
