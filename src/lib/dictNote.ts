// Turning a dictionary entry into a block of a card's note.
//
// The note is the card's own text, so the dictionary goes in as one clearly
// delimited block at the end: it can be deleted in one stroke, refilled in
// place, and everything written by hand stays above it untouched. The `dict`
// tag renders collapsed (see MarkdocContent) — a word like `aan` has 17
// meanings, and on the Learn page that would bury the card itself.

import { senseGroups, type DictEntry, type DictInfo } from "./dictionary";

export const DICT_OPEN = "{% dict %}";
export const DICT_CLOSE = "{% /dict %}";

/** The whole block, so a refill replaces it instead of stacking a second one. */
const DICT_BLOCK = /\n*\{%\s*dict\s*%\}[\s\S]*?\{%\s*\/dict\s*%\}\n*/;

/** Verb forms, as one line: "past ging, plural gingen, participle gegaan". */
function verbForms(entry: DictEntry): string {
  const v = entry.verb;
  if (!v) return "";
  const parts = [
    v.past && `past *${v.past}*`,
    v.pastPl && `plural *${v.pastPl}*`,
    v.participle && `participle *${v.participle}*`,
  ].filter(Boolean);
  return parts.join(", ");
}

/**
 * One sense as a list item. Examples hang off it as hard-broken lines rather
 * than nested paragraphs: inside a collapsed block, dense reads better, and it
 * keeps each meaning to a single item however many examples it carries.
 */
function senseItem(sense: DictInfo, n: number): string {
  const syn = sense.synonyms?.length
    ? ` — syn: *${sense.synonyms.join(", ")}*`
    : "";
  // The meaning is bold: it is what the item is actually about, and without it
  // the gloss reads as one more grey line among its own examples.
  const lines = [`${n}. **${sense.translation}**${syn}`];
  for (const example of sense.examples?.split("\n\n") ?? []) {
    // First line is the Dutch, any line after it the translation — italic, so
    // the two are told apart at a glance the way the dictionary page dims them.
    example.split("\n").forEach((line, i) => {
      const text = line.trim();
      if (text) lines.push(`   ${i === 0 ? text : `*${text}*`}`);
    });
  }
  // A trailing backslash is a CommonMark hard break, so the whole item stays
  // one list item with its examples on their own lines under the meaning.
  return lines.join("\\\n");
}

/**
 * The dictionary block for `entry`, or "" when there is nothing to say. Every
 * sense is included: the entries worth filling in are small (a median of two
 * meanings), and the ones that aren't belong to words nobody adds as a card.
 */
export function buildDictBlock(entry: DictEntry): string {
  const groups = senseGroups(entry);
  const forms = verbForms(entry);
  if (groups.length === 0 && !forms) return "";

  const chunks: string[] = [];
  for (const group of groups) {
    const label = group.pos ?? "meanings";
    // Verb forms belong to the entry but only read as anything next to the
    // verb senses, so they ride along on that group's heading.
    const head =
      group.pos === "verb" && forms
        ? `**${label}** — ${forms}`
        : `**${label}**`;
    chunks.push(head);
    chunks.push(group.senses.map((s, i) => senseItem(s, i + 1)).join("\n"));
  }
  // A verb whose senses Wiktionary doesn't have still has its forms worth
  // keeping.
  if (chunks.length === 0 && forms) chunks.push(`**verb** — ${forms}`);

  return `${DICT_OPEN}\n${chunks.join("\n\n")}\n${DICT_CLOSE}`;
}

/** A note with `block` as its dictionary section, replacing any previous one. */
export function withDictBlock(note: string, block: string): string {
  const rest = note.replace(DICT_BLOCK, "\n\n").trim();
  if (!block) return rest;
  return rest ? `${rest}\n\n${block}` : block;
}

/** Whether a note already carries a dictionary block. */
export function hasDictBlock(note: string): boolean {
  return DICT_BLOCK.test(note);
}
