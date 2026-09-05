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
import { editEvent, trimCardText, type CardText } from "./deck";
import type { LinkedCard } from "./examples";
import { getDefaultLineId } from "./lines";
import { enqueueTop, logEntry, type CardLog } from "./queue";
import { ownedPath, ownerId } from "./session";
import { introduce } from "./srs";
import type { CardData } from "../pages/Cards";

/**
 * One operation in a `db.transact` batch, derived from `transact` itself so a
 * batch can mix entities (a card update alongside a `$files` delete) — the
 * per-entity chunk types on their own don't unify.
 */
type TxOp = Extract<Parameters<typeof db.transact>[0], unknown[]>[number];

// `trimCardText` and the edit diff live in `lib/deck.ts`, the one module the
// MCP server can import — everything here reaches `../db`, which connects on
// import. Re-exported so the pages keep importing card things from cards.ts.
export { trimCardText, type CardText };

/** `editEvent` under its own event id, ready to merge into `cards.log`. */
export function editEntry(
  before: Partial<CardText>,
  after: CardText,
): CardLog | null {
  const event = editEvent(before, after);
  return event && { [id()]: event };
}

/**
 * Save an edited card. `imageFile` uploads and links a new image; the caller
 * passes `removeImageId` (the card's current image id) when the old image
 * should be unlinked and deleted, either because it was removed or replaced.
 *
 * The card comes in whole, not as an id, so the text it used to hold can go
 * into the log alongside the new one.
 */
export async function saveCard(
  card: { id: string } & Partial<CardText>,
  formData: CardData,
  imageFile: File | null,
  removeImageId: string | null,
): Promise<void> {
  const cardId = card.id;
  const text = trimCardText(formData);
  const edit = editEntry(card, text);
  const ops: TxOp[] = [db.tx.cards[cardId].update(text)];
  // `merge`, not `update` — the log is one JSON blob and an update would
  // replace the whole history with this single event.
  if (edit) ops.push(db.tx.cards[cardId].merge({ log: edit }));
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

/**
 * Throw a card away: stamp `deletedAt` and log it. The row stays whole — its
 * srs state, its log, its line ranks — so `restoreCard` is the only thing
 * needed to bring it back. Reads keep deleted cards out by filtering on
 * `deletedAt` (`myCards()` in lib/session.ts).
 */
export function deleteCard(cardId: string): Promise<unknown> {
  return db.transact([
    // Two ops on purpose: `deletedAt` is a plain attribute (update), the log is
    // one JSON blob every writer merges into.
    db.tx.cards[cardId].update({ deletedAt: Date.now() }),
    db.tx.cards[cardId].merge({ log: logEntry("", "delete", 0) }),
  ]);
}

/** Undo a `deleteCard`. No screen calls this yet — it is for the console and
 *  for whatever un-delete list gets built. */
export function restoreCard(cardId: string): Promise<unknown> {
  return db.transact([
    db.tx.cards[cardId].update({ deletedAt: null }),
    db.tx.cards[cardId].merge({ log: logEntry("", "restore", 0) }),
  ]);
}

/**
 * Create a card from a dictionary entry and put it at the top of the default
 * line, the same card the Dictionary page's "+ Add to cards" makes. It goes
 * straight into study — `introduce` seeds its FSRS state here, so a new card
 * is asked at the next session instead of waiting in the Backlog pool.
 * Returns it in the shape the example editors label a link with, so the caller
 * can attach it to a sentence straight away.
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
  const lineId = await getDefaultLineId();
  await enqueueTop(lineId, cardId);
  await introduce([cardId], lineId);
  return {
    id: cardId,
    aLang: card.aLang,
    bLang: card.bLang,
    aCard: card.aCard,
    bCard: card.bCard,
  };
}
