import { useEffect, useMemo, useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import { createCardFromEntry } from "../lib/cards";
import {
  cardRuns,
  entryCardBack,
  entryCardFront,
  findOwnCard,
  loadDictionary,
  searchDictionary,
  type DictEntry,
} from "../lib/dictionary";
import type { LinkedCard } from "../lib/examples";
import { useLinePositions } from "../lib/lines";
import type { CardQueues } from "../lib/queue";
import { myCards } from "../lib/session";
import LinePos from "./LinePos";
import SearchPicker, { pickerNote, pickerRow } from "./SearchPicker";

/** A card as the picker searches it — the note is matched, but never shown. */
type SearchableCard = LinkedCard & { note?: string; queues?: CardQueues };

const cardRowBody = css`
  display: flex;
  align-items: baseline;
  gap: 0.4rem;

  span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const posEnd = css`
  margin-left: auto;
`;

// The word leads, behind the button that makes it: without the heading above
// them, that chip is what tells a dictionary row from a card row.
const dictRowBody = css`
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 0;

  small {
    margin-left: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const dictAdd = css`
  flex-shrink: 0;
  font-size: 0.7rem;
  color: #2563eb;
  background: #f3f7ff;
  border: 1px solid #d8e4fd;
  border-radius: 4px;
  padding: 0.02rem 0.28rem;
  white-space: nowrap;
`;

const dictWord = css`
  font-weight: 500;
  white-space: nowrap;
`;

interface Props {
  /** Cards already attached, which the dropdown leaves out. */
  exclude: Set<string>;
  /**
   * The cards to search. Loaded here when the caller hasn't got them already —
   * a page that lists cards anyway should pass its own rather than have this
   * subscribe to the table a second time.
   */
  cards?: SearchableCard[];
  onPick: (card: LinkedCard) => void;
}

/**
 * Search box that picks a card to attach an example to, falling through to the
 * dictionary when the word isn't a card yet: picking a dictionary entry creates
 * the card (same one the Dictionary page's "+ Add to cards" makes, top of the
 * default line) and hands it straight back to be attached. The card is written
 * there and then, whether or not the caller goes on to save the attachment —
 * "+ new card" is taken at its word.
 */
export default function CardPicker({ exclude, cards, onPick }: Props) {
  const { data } = db.useQuery(
    cards ? null : { cards: { $: { where: myCards(), limit: 5000 } } },
  );
  const all = useMemo(
    () => cards ?? ((data?.cards ?? []) as SearchableCard[]),
    [cards, data?.cards],
  );
  const positions = useLinePositions(all);

  return (
    <SearchPicker
      items={all}
      exclude={exclude}
      // Dutch side, then the translation, then the note — a word typed here is
      // nearly always a card's own side A, so a note that happens to mention it
      // must not come first.
      fields={(c) => [c.aCard, c.bCard, c.note]}
      renderItem={(c) => (
        <span className={cardRowBody}>
          <span>
            {c.aCard}
            <small>{c.bCard}</small>
          </span>
          <LinePos positions={positions.get(c.id)} className={posEnd} />
        </span>
      )}
      placeholder="+ Attach a card — search cards or the dictionary…"
      onPick={onPick}
      footer={(query, { clear, matches }) => (
        <DictSuggestions
          query={query}
          cards={all}
          cardMatches={matches}
          onPick={(card) => {
            onPick(card);
            clear();
          }}
        />
      )}
    />
  );
}

/** How many dictionary entries the dropdown offers under the card matches. */
const DICT_LIMIT = 5;

/**
 * The dictionary half of the dropdown, under the card matches and told apart
 * from them by the "+ new card" each row leads with. Every row here really does
 * make a card: a word you already have one for is dropped, since that card is
 * among the matches above — the same substring that found the entry finds it —
 * and offering it twice would both duplicate the row and make "+ new card" a
 * lie.
 *
 * Silent when the cards above already answered the query: this is the fallback,
 * not a second list to read every time.
 */
function DictSuggestions({
  query,
  cards,
  cardMatches,
  onPick,
}: {
  query: string;
  cards: SearchableCard[];
  cardMatches: number;
  onPick: (card: LinkedCard) => void;
}) {
  const [entries, setEntries] = useState<DictEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const q = query.trim();

  // 3.4 MB of JSON, so it is fetched on the first keystroke rather than when
  // the editor opens — most sentences are linked without ever reaching it.
  // A failed fetch is remembered: `loadDictionary` caches the rejected promise,
  // so without this the box would sit on "loading" for the rest of the session.
  useEffect(() => {
    if (q === "" || entries || failed) return;
    let alive = true;
    loadDictionary()
      .then((loaded) => alive && setEntries(loaded))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [q, entries, failed]);

  const runs = useMemo(() => cardRuns(cards), [cards]);

  // Words the user has no card for. Searching a few more than are shown leaves
  // room for the ones this drops.
  const hits = useMemo(() => {
    if (!entries || q === "") return [];
    return searchDictionary(entries, q, DICT_LIMIT * 3)
      .filter((entry) => !findOwnCard(runs, entry.word))
      .slice(0, DICT_LIMIT);
  }, [entries, q, runs]);

  if (q === "") return null;
  if (failed) {
    return cardMatches === 0 ? (
      <div className={pickerNote}>The dictionary didn't load.</div>
    ) : null;
  }
  if (!entries) {
    return cardMatches === 0 ? (
      <div className={pickerNote}>Loading the dictionary…</div>
    ) : null;
  }
  if (hits.length === 0) {
    return cardMatches === 0 ? (
      <div className={pickerNote}>Nothing in your cards or the dictionary.</div>
    ) : null;
  }

  async function pick(entry: DictEntry) {
    setBusy(entry.word);
    try {
      onPick(await createCardFromEntry(entry));
    } catch {
      // Two transactions (the card, then its place in the line), so a failure
      // can leave a card in no line — visible as "not in line" on the row it
      // would have made, and fixable with the same button on a second press.
      alert(`Could not add “${entry.word}” to your cards.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {hits.map((entry, i) => {
        const back = entryCardBack(entry);
        return (
          <button
            key={`${entry.word}-${i}`}
            type="button"
            className={pickerRow}
            // A word with no translation at all would make a card with an
            // empty back; the Dictionary page refuses the same one.
            disabled={busy !== null || back === ""}
            onClick={() => pick(entry)}
          >
            <span className={dictRowBody}>
              <span className={dictAdd}>
                {busy === entry.word ? "adding…" : "+ new card"}
              </span>
              <span className={dictWord}>{entryCardFront(entry)}</span>
              <small>{back || "no translation"}</small>
            </span>
          </button>
        );
      })}
    </>
  );
}
