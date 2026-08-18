// Card mutations shared by every page that edits a card through CardModal.
// Line membership is not touched here — CardModal applies that itself via the
// queue helpers.

import { id } from "@instantdb/react";
import { db } from "../db";
import { buildDictBlock, withDictBlock } from "./dictNote";
import {
  deckInfo,
  entryCardBack,
  entryCardFront,
  type DictEntry,
} from "./dictionary";
import type { LinkedCard } from "./examples";
import { getDefaultLineId } from "./lines";
import { enqueueTop } from "./queue";
import { ownedPath, ownerId } from "./session";
import type { CardData } from "../pages/Cards";

/**
 * One operation in a `db.transact` batch, derived from `transact` itself so a
 * batch can mix entities (a card update alongside a `$files` delete) — the
 * per-entity chunk types on their own don't unify.
 */
type TxOp = Extract<Parameters<typeof db.transact>[0], unknown[]>[number];

/** The text fields of a card, the ones a person types into. */
interface CardText {
  aCard: string;
  bCard: string;
  note: string;
}

/**
 * Strip the whitespace around a card's text. It arrives with pasted words and
 * as the newline left behind at the end of a note, and it is never meaningful:
 * it breaks the dictionary's `lemmaKey` lookups and shows up as a blank first
 * line on the card. Every write path runs its form through here. Only the ends
 * go — a note's own line breaks are the whole point of it.
 */
export function trimCardText<T extends CardText>(data: T): T {
  return {
    ...data,
    aCard: data.aCard.trim(),
    bCard: data.bCard.trim(),
    note: data.note.trim(),
  };
}

/**
 * Save an edited card. `imageFile` uploads and links a new image; the caller
 * passes `removeImageId` (the card's current image id) when the old image
 * should be unlinked and deleted, either because it was removed or replaced.
 */
export async function saveCard(
  cardId: string,
  formData: CardData,
  imageFile: File | null,
  removeImageId: string | null,
): Promise<void> {
  const ops: TxOp[] = [db.tx.cards[cardId].update(trimCardText(formData))];
  if (removeImageId) {
    ops.push(db.tx.cards[cardId].unlink({ image: removeImageId }));
    ops.push(db.tx.$files[removeImageId].delete());
  }
  if (imageFile) {
    const { data: fileData } = await db.storage.uploadFile(
      ownedPath(`cards/${cardId}-${Date.now()}`),
      imageFile,
    );
    if (fileData) {
      ops.push(db.tx.$files[fileData.id].link({ owner: ownerId() }));
      ops.push(db.tx.cards[cardId].link({ image: fileData.id }));
    }
  }
  await db.transact(ops);
}

export function deleteCard(cardId: string): Promise<unknown> {
  return db.transact(db.tx.cards[cardId].delete());
}

/**
 * Create a card from a dictionary entry and put it at the top of the default
 * line, the same card the Dictionary page's "+ Add to cards" makes. Returns it
 * in the shape the example editors label a link with, so the caller can attach
 * it to a sentence straight away.
 *
 * Deck examples go in as the note's own text; the whole Wiktionary entry
 * follows in a `{% dict %}` block, which renders collapsed and can be deleted
 * or refilled in one stroke later.
 */
export async function createCardFromEntry(
  entry: DictEntry,
): Promise<LinkedCard> {
  const cardId = id();
  const note = withDictBlock(
    deckInfo(entry)
      .flatMap((i) => (i.examples ? [i.examples] : []))
      .join("\n\n"),
    buildDictBlock(entry),
  );
  // entry.info[].audio is stored as "dict/<file>.mp3"; the card keeps the full
  // path from public/ so it can be played directly. Prefer a clip from the
  // "common" source, falling back to the first info that has any audio.
  const rawAudio = (
    entry.info.find((i) => i.audio && i.source === "common") ??
    entry.info.find((i) => i.audio)
  )?.audio;

  const card = {
    aLang: "NL",
    bLang: "EN",
    ...trimCardText({
      aCard: entryCardFront(entry),
      bCard: entryCardBack(entry),
      note,
    }),
  };
  await db.transact(
    db.tx.cards[cardId]
      .update({ ...card, ...(rawAudio ? { audio: `audio/${rawAudio}` } : {}) })
      .link({ owner: ownerId() }),
  );
  await enqueueTop(await getDefaultLineId(), cardId);
  return {
    id: cardId,
    aLang: card.aLang,
    bLang: card.bLang,
    aCard: card.aCard,
    bCard: card.bCard,
  };
}
