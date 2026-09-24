// Examples are sentences that can be attached to many cards at once. What
// makes an attachment interesting is *where* in the sentence the card appears:
// an `exampleLink` carries a list of spans into the example's side A, so the
// same sentence can be a different exercise for each card it belongs to
// ("Ik sta elke dag om 7 uur op" hides `sta`+`op` for "opstaan", but `elke dag`
// for "elke").
//
// InstantDB links can't carry attributes, hence the `exampleLinks` join entity
// rather than a plain many-to-many between cards and examples.

import { id } from "@instantdb/react";
import { db } from "../db";
import { ownerId } from "./session";
import { anchorSpans, type Span } from "./spans";
import type { CardLog } from "./queue";

// Span arithmetic lives in `./spans` — no `../db` there, so the MCP server can
// import it. Re-exported here because this is where the app has always found
// it.
export * from "./spans";

/** The editable fields of an example, as the forms hold them. */
export interface ExampleData {
  aLang: string;
  bLang: string;
  aText: string;
  bText: string;
  note: string;
}

export interface Example {
  id: string;
  aLang: string;
  bLang: string;
  aText: string;
  bText?: string;
  note?: string;
  createdAt: number;
  links?: ExampleLink[];
}

/** The bits of a card an example row needs to label its link. */
export interface LinkedCard {
  id: string;
  aLang: string;
  bLang: string;
  aCard: string;
  bCard: string;
  /** Set once the card is thrown away — see `liveLinks`. */
  deletedAt?: number | null;
}

export interface ExampleLink {
  id: string;
  spans: Span[];
  createdAt: number;
  card?: LinkedCard;
  example?: Example;
}

/**
 * An example's links, minus the ones pointing at a thrown-away card. Deleting a
 * card is a `deletedAt` stamp (`deleteCard` in lib/cards.ts) and the join row
 * survives it, so without this the card goes on labelling its sentences, and
 * `where` can't help — a nested link isn't filterable in the query. Links with
 * no card at all are left in: the callers that mind already check.
 *
 * Not applied on the write paths (`saveExampleOps` re-anchors every link,
 * deleted or not) — a restored card should find its blanks where it left them.
 */
export function liveLinks(
  example?: { links?: ExampleLink[] } | null,
): ExampleLink[] {
  return (example?.links ?? []).filter((l) => !l.card?.deletedAt);
}

export function emptyExample(aLang = "NL", bLang = "EN"): ExampleData {
  return { aLang, bLang, aText: "", bText: "", note: "" };
}

/** Strip an example down to the fields the forms edit. */
export function toExampleData(ex: Example): ExampleData {
  return {
    aLang: ex.aLang,
    bLang: ex.bLang,
    aText: ex.aText,
    bText: ex.bText ?? "",
    note: ex.note ?? "",
  };
}

/**
 * Which of a card's examples to put up as a cloze. Only links that actually
 * hide something qualify; among those the least recently answered wins, so a
 * card carrying several sentences cycles through them instead of drilling one.
 * Links never answered count as infinitely old. Deterministic given the log,
 * so re-rendering doesn't reshuffle the sentence mid-answer.
 */
export function pickClozeLink(
  links: ExampleLink[],
  log?: CardLog,
): ExampleLink | undefined {
  const usable = links.filter((l) => l.example && (l.spans?.length ?? 0) > 0);
  if (usable.length === 0) return undefined;

  const lastSeen = new Map<string, number>();
  for (const e of Object.values(log ?? {})) {
    if (!e.linkId) continue;
    lastSeen.set(e.linkId, Math.max(lastSeen.get(e.linkId) ?? 0, e.at));
  }

  return usable.reduce((best, l) =>
    (lastSeen.get(l.id) ?? 0) < (lastSeen.get(best.id) ?? 0) ? l : best,
  );
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

type TxOp = Extract<Parameters<typeof db.transact>[0], unknown[]>[number];

/** A link row as the example editor holds it, before it is written. */
export interface PendingLink {
  /** The link's id — generated up front for rows that don't exist yet. */
  id: string;
  card: LinkedCard;
  spans: Span[];
  /** False for rows added in this editing session. */
  existing: boolean;
}

/**
 * Write an example and its links in one transaction. Pass `exampleId` to update
 * an existing example or `null` to create one; the id is returned either way.
 * Spans are re-anchored against the sentence as saved, so editing the sentence
 * and the links together in one pass can't leave a link pointing at offsets
 * that no longer hold.
 */
export async function saveExampleWithLinks(
  exampleId: string | null,
  data: ExampleData,
  links: PendingLink[],
  removedLinkIds: string[] = [],
): Promise<string> {
  const exId = exampleId ?? id();
  const ops: TxOp[] = [
    exampleId
      ? db.tx.examples[exId].update(data)
      : db.tx.examples[exId]
          .update({ ...data, createdAt: Date.now() })
          .link({ owner: ownerId() }),
  ];

  for (const linkId of removedLinkIds) {
    ops.push(db.tx.exampleLinks[linkId].delete());
  }

  for (const link of links) {
    const spans = anchorSpans(data.aText, link.spans).spans;
    if (link.existing) {
      ops.push(db.tx.exampleLinks[link.id].update({ spans }));
    } else {
      ops.push(
        db.tx.exampleLinks[link.id]
          .update({ spans, createdAt: Date.now() })
          .link({ card: link.card.id, example: exId, owner: ownerId() }),
      );
    }
  }

  await db.transact(ops);
  return exId;
}

/**
 * Create one bare example — no translation, no card links. Whatever was typed
 * goes in as it stands; the translating and linking happens later. Returns the
 * new id, so the caller can select the row it just made.
 */
export async function createExample(
  aText: string,
  aLang: string,
  bLang: string,
): Promise<string> {
  const exampleId = id();
  await db.transact(
    db.tx.examples[exampleId]
      .update({ aLang, bLang, aText, createdAt: Date.now() })
      .link({ owner: ownerId() }),
  );
  return exampleId;
}

/**
 * Attach an example to a card with no fragments picked yet, returning the new
 * link's id straight away — the caller makes it the row being edited, and
 * InstantDB's optimistic write means it is on screen before the server answers.
 */
export function createExampleLink(exampleId: string, cardId: string): string {
  const linkId = id();
  db.transact(
    db.tx.exampleLinks[linkId]
      .update({ spans: [], createdAt: Date.now() })
      .link({ card: cardId, example: exampleId, owner: ownerId() }),
  );
  return linkId;
}

/**
 * The ops that write `data` over `example`, or none at all if nothing changed.
 * When the sentence itself moved, every link's spans are re-anchored in the
 * same list — the same rule `saveExampleWithLinks` applies on the modal's path,
 * kept here so the panel that saves as you type can't state it differently.
 */
export function exampleUpdateOps(example: Example, data: ExampleData): TxOp[] {
  if (
    data.aText === example.aText &&
    data.bText === (example.bText ?? "") &&
    data.note === (example.note ?? "") &&
    data.aLang === example.aLang &&
    data.bLang === example.bLang
  )
    return [];

  const ops: TxOp[] = [db.tx.examples[example.id].update(data)];
  if (data.aText !== example.aText) {
    for (const link of example.links ?? []) {
      ops.push(
        db.tx.exampleLinks[link.id].update({
          spans: anchorSpans(data.aText, link.spans ?? []).spans,
        }),
      );
    }
  }
  return ops;
}

/**
 * Save one link's fragments, carrying any edit to the example still sitting in
 * the form along in the same transaction — offsets and the sentence they index
 * into must never be written a beat apart.
 */
export function saveLinkSpans(
  example: Example,
  data: ExampleData,
  linkId: string,
  spans: Span[],
): Promise<unknown> {
  return db.transact([
    ...exampleUpdateOps(example, data),
    db.tx.exampleLinks[linkId].update({ spans }),
  ]);
}

/** Delete an example. Its links go with it (`onDelete: "cascade"`). */
export function deleteExample(exampleId: string): Promise<unknown> {
  return db.transact(db.tx.examples[exampleId].delete());
}

/** Detach an example from one card, keeping both. */
export function unlinkExample(linkId: string): Promise<unknown> {
  return db.transact(db.tx.exampleLinks[linkId].delete());
}
