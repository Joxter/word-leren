#!/usr/bin/env node
/**
 * Slim the Kaikki extract of Dutch down to the words this dictionary uses.
 *
 * Kaikki publishes Wiktionary as machine-readable JSONL. The full Dutch file is
 * ~236 MB / 145k entries, which has no business being in the repo — this script
 * keeps only the headwords the dictionary actually has (plus the ERK-A2 list)
 * and only the fields the app shows, writing ~2 MB to sources/kaikki-nl.jsonl.
 * That slim file *is* committed, so `npm run build-dictionary` stays offline.
 *
 * Note this is the Dutch section of the **English** Wiktionary (glosses in
 * English, with `head_templates` and `forms`), not the Dutch-language edition
 * under kaikki.org/dictionary/downloads/nl — that one has neither.
 *
 * Usage:
 *   node scripts/fetch-kaikki.mjs [local-extract.jsonl]   (downloads if omitted)
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCES = join(ROOT, "sources");
const DICT = join(ROOT, "public", "data", "dictionary.json");
const ERK = join(SOURCES, "erk-a2.txt");
const OUT = join(SOURCES, "kaikki-nl.jsonl");

const URL_EXTRACT =
  "https://kaikki.org/dictionary/Dutch/kaikki.org-dictionary-Dutch.jsonl";
const WORK = join(tmpdir(), "word-leren-kaikki");

// ── which words we care about ────────────────────────────────────────────────

// The headword set comes from the previous build's output. That is a bootstrap
// dependency, but a harmless one: the dictionary is deterministic from the
// decks, so run build-dictionary once and this list is stable.
const headwords = new Set();

if (existsSync(DICT)) {
  for (const e of JSON.parse(readFileSync(DICT, "utf-8"))) {
    headwords.add(e.word.toLowerCase());
  }
} else {
  console.warn(
    "⚠️  no public/data/dictionary.json — run build-dictionary first",
  );
}

if (existsSync(ERK)) {
  for (const line of readFileSync(ERK, "utf-8").split("\n")) {
    const w = line.trim();
    if (w && !w.startsWith("#")) headwords.add(w.toLowerCase());
  }
}

console.log(`Headwords wanted: ${headwords.size}`);

// ── the extract ──────────────────────────────────────────────────────────────

let extractPath = process.argv[2];
if (!extractPath) {
  await mkdir(WORK, { recursive: true });
  extractPath = join(WORK, "dutch.jsonl");
  if (existsSync(extractPath)) {
    const { size } = await stat(extractPath);
    console.log(`Using cached extract (${(size / 1e6).toFixed(0)} MB)`);
  } else {
    console.log(`Downloading ${URL_EXTRACT} …`);
    const res = await fetch(URL_EXTRACT);
    if (!res.ok) {
      console.error(`❌  HTTP ${res.status}`);
      process.exit(1);
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(extractPath));
    const { size } = await stat(extractPath);
    console.log(`    ${(size / 1e6).toFixed(0)} MB`);
  }
}

// ── parsing ──────────────────────────────────────────────────────────────────

// Wiktionary writes gender as a template argument: "n", "m", "f", "c" (common),
// and comma-joined when a word takes more than one ("n,m" renders as "n or m").
const ARTICLE = { n: "het", m: "de", f: "de", c: "de" };

/** Every gender any entry claims for this word, as articles. */
function genders(entry) {
  const out = new Set();
  for (const ht of entry.head_templates ?? []) {
    const arg = ht.args?.["1"];
    if (arg) {
      for (const g of String(arg).split(",")) {
        if (ARTICLE[g.trim()]) out.add(ARTICLE[g.trim()]);
      }
      continue;
    }
    // Some entries carry no args and only render the gender into the headline,
    // e.g. "katje n (plural katjes)".
    const m = /^\S+\s+([a-z]+)\b/.exec(ht.expansion ?? "");
    if (m && ARTICLE[m[1]]) out.add(ARTICLE[m[1]]);
  }
  return out;
}

/** Past singular / past plural / past participle, from the conjugation table. */
function verbForms(entry) {
  const out = {};
  for (const f of entry.forms ?? []) {
    const t = new Set(f.tags ?? []);
    const has = (...xs) => xs.every((x) => t.has(x));
    if (!out.past && has("past", "singular", "first-person")) out.past = f.form;
    if (!out.pastPl && has("past", "plural") && !t.has("subjunctive")) {
      out.pastPl = f.form;
    }
    if (!out.participle && has("past", "participle")) out.participle = f.form;
  }
  return out;
}

function senses(entry) {
  const out = [];
  for (const s of entry.senses ?? []) {
    const gloss = s.glosses?.[0];
    if (!gloss) continue;
    const examples = (s.examples ?? []).map((x) => x.text).filter(Boolean);
    const synonyms = (s.synonyms ?? []).map((x) => x.word).filter(Boolean);
    out.push({
      pos: entry.pos,
      gloss,
      ...(examples.length ? { examples } : {}),
      ...(synonyms.length ? { synonyms } : {}),
    });
  }
  return out;
}

// ── merge every entry of a word into one record ──────────────────────────────

/** @type {Map<string, any>} */
const words = new Map();
let scanned = 0;
let kept = 0;

const rl = createInterface({
  input: createReadStream(extractPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line.startsWith("{")) continue;
  scanned++;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  const word = entry.word ?? "";
  if (!headwords.has(word.toLowerCase())) continue;
  kept++;

  let rec = words.get(word);
  if (!rec) {
    rec = { word, articles: new Set(), senses: [] };
    words.set(word, rec);
  }
  if (entry.pos === "noun") for (const a of genders(entry)) rec.articles.add(a);
  if (entry.pos === "verb" && !rec.verb) {
    const v = verbForms(entry);
    if (v.past || v.participle) rec.verb = v;
  }
  rec.senses.push(...senses(entry));
}

// ── write ────────────────────────────────────────────────────────────────────

const lines = [];
let withArticle = 0;
let ambiguous = 0;
let withVerb = 0;

for (const rec of [...words.values()].sort((a, b) =>
  a.word.localeCompare(b.word, "nl"),
)) {
  if (rec.senses.length === 0 && !rec.verb && rec.articles.size === 0) continue;
  // A word Wiktionary gives two genders ("de of het deken") can't answer the
  // question the app asks, so it is left out rather than guessed at — the
  // de/het deck still has a usable answer for those.
  const article = rec.articles.size === 1 ? [...rec.articles][0] : undefined;
  if (rec.articles.size > 1) ambiguous++;
  if (article) withArticle++;
  if (rec.verb) withVerb++;
  lines.push(
    JSON.stringify({
      word: rec.word,
      ...(article ? { article } : {}),
      ...(rec.verb ? { verb: rec.verb } : {}),
      senses: rec.senses,
    }),
  );
}

writeFileSync(OUT, lines.join("\n") + "\n");

const { size } = await stat(OUT);
console.log(`\nScanned ${scanned} entries, kept ${kept}`);
console.log(
  `Wrote ${lines.length} words to sources/kaikki-nl.jsonl (${(size / 1e6).toFixed(2)} MB)`,
);
console.log(
  `  with article: ${withArticle}  (${ambiguous} skipped as ambiguous)`,
);
console.log(`  with verb forms: ${withVerb}`);
