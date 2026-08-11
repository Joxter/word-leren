// Card mutations shared by every page that edits a card through CardModal.
// Line membership is not touched here — CardModal applies that itself via the
// queue helpers.

import { db } from "../db";
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
