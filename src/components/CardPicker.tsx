import { db } from "../db";
import type { LinkedCard } from "../lib/examples";
import SearchPicker from "./SearchPicker";

/** A card as the picker searches it — the note is matched, but never shown. */
type SearchableCard = LinkedCard & { note?: string };

interface Props {
  /** Cards already attached, which the dropdown leaves out. */
  exclude: Set<string>;
  onPick: (card: LinkedCard) => void;
}

/** Search box that picks a card to attach an example to. */
export default function CardPicker({ exclude, onPick }: Props) {
  const { data } = db.useQuery({ cards: { $: { limit: 5000 } } });

  return (
    <SearchPicker
      items={(data?.cards ?? []) as SearchableCard[]}
      exclude={exclude}
      // Dutch side, then the translation, then the note — a word typed here is
      // nearly always a card's own side A, so a note that happens to mention it
      // must not come first.
      fields={(c) => [c.aCard, c.bCard, c.note]}
      renderItem={(c) => (
        <>
          {c.aCard}
          <small>{c.bCard}</small>
        </>
      )}
      placeholder="+ Attach a card — search by either side…"
      onPick={onPick}
    />
  );
}
