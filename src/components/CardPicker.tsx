import { db } from "../db";
import type { LinkedCard } from "../lib/examples";
import SearchPicker from "./SearchPicker";

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
      items={(data?.cards ?? []) as LinkedCard[]}
      exclude={exclude}
      fields={(c) => [c.aCard, c.bCard]}
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
