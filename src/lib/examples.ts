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
import type { CardLog } from "./queue";

/** A hidden fragment of an example's side A. `end` is exclusive. */
export interface Span {
  start: number;
  end: number;
  /**
   * A copy of `aText.slice(start, end)`. Offsets go stale as soon as the
   * sentence is edited, so this is what actually identifies the fragment —
   * see `anchorSpans`.
   */
  text: string;
}

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
}

export interface ExampleLink {
  id: string;
  spans: Span[];
  createdAt: number;
  card?: LinkedCard;
  example?: Example;
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

// ---------------------------------------------------------------------------
// Spans
// ---------------------------------------------------------------------------

/**
 * Clamp spans to the text, drop empty ones, sort them, merge any that touch or
 * overlap, and refresh each `text` from the source. Spans separated by so much
 * as a space are left apart, so they stay two blanks in the UI.
 */
export function normalizeSpans(spans: Span[], text: string): Span[] {
  const clamped = spans
    .map((s) => ({
      start: Math.max(0, Math.min(s.start, text.length)),
      end: Math.max(0, Math.min(s.end, text.length)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const s of clamped) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }

  return merged.map((s) => ({ ...s, text: text.slice(s.start, s.end) }));
}

export interface AnchorResult {
  /** Spans that still point at their fragment, re-anchored where needed. */
  spans: Span[];
  /** Spans whose fragment is gone from the sentence entirely. */
  broken: Span[];
}

/**
 * Re-attach spans to a sentence that may have been edited since they were
 * saved. A span whose offsets still slice out its `text` is kept as-is;
 * otherwise the fragment is searched for, and the occurrence nearest the old
 * offset wins — that survives the usual edit (a typo fixed elsewhere shifts
 * everything by a character or two) even when the fragment repeats. Only a
 * fragment that no longer occurs at all is reported as broken.
 */
export function anchorSpans(text: string, spans: Span[]): AnchorResult {
  const found: Span[] = [];
  const broken: Span[] = [];

  for (const span of spans) {
    if (span.text && text.slice(span.start, span.end) === span.text) {
      found.push(span);
      continue;
    }
    const moved = span.text ? nearestOccurrence(text, span) : null;
    if (moved) found.push(moved);
    else broken.push(span);
  }

  return { spans: normalizeSpans(found, text), broken };
}

function nearestOccurrence(text: string, span: Span): Span | null {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = text.indexOf(span.text); i !== -1;) {
    const distance = Math.abs(i - span.start);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
    i = text.indexOf(span.text, i + 1);
  }
  if (best === -1) return null;
  return { start: best, end: best + span.text.length, text: span.text };
}

export interface Segment {
  text: string;
  /** True for the parts covered by a span (the ones a cloze hides). */
  blank: boolean;
}

/**
 * Cut `text` into alternating plain and covered pieces. `spans` must already be
 * normalized (sorted, non-overlapping). Empty pieces are dropped, so a sentence
 * that starts with a blank doesn't lead with an empty plain segment.
 */
export function segmentText(text: string, spans: Span[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start > at)
      out.push({ text: text.slice(at, span.start), blank: false });
    out.push({ text: text.slice(span.start, span.end), blank: true });
    at = span.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), blank: false });
  return out;
}

/** What the user is expected to type for a cloze: the fragments, in order. */
export function spansAnswer(spans: Span[]): string {
  return spans.map((s) => s.text).join(" ");
}

export interface Token {
  start: number;
  end: number;
  text: string;
  /** Word tokens are the ones the span picker lets you click. */
  word: boolean;
}

// Letters and digits, plus internal apostrophes and hyphens so "auto's" and
// "twee-en-twintig" stay one clickable token.
const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

/** Split a sentence into word tokens and the punctuation/space runs between. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  WORD_RE.lastIndex = 0;
  for (let m = WORD_RE.exec(text); m; m = WORD_RE.exec(text)) {
    if (m.index > at) {
      out.push({
        start: at,
        end: m.index,
        text: text.slice(at, m.index),
        word: false,
      });
    }
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      word: true,
    });
    at = m.index + m[0].length;
  }
  if (at < text.length) {
    out.push({
      start: at,
      end: text.length,
      text: text.slice(at),
      word: false,
    });
  }
  return out;
}

/** Whether any span covers part of `[start, end)`. */
export function isCovered(spans: Span[], start: number, end: number): boolean {
  return spans.some((s) => s.start < end && start < s.end);
}

/**
 * Click behaviour for the span picker: a range that already overlaps a blank
 * clears the blanks it touches, an untouched one becomes a new blank.
 */
export function toggleSpan(
  spans: Span[],
  start: number,
  end: number,
  text: string,
): Span[] {
  if (isCovered(spans, start, end)) {
    return spans.filter((s) => !(s.start < end && start < s.end));
  }
  return normalizeSpans(
    [...spans, { start, end, text: text.slice(start, end) }],
    text,
  );
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
