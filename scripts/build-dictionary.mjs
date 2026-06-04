// Build a merged Dutch dictionary from the source decks in /sources.
//
// Reads 5 Anki .apkg decks + 1 CSV, normalizes each Dutch headword to a lemma,
// and merges them into one entry per word:
//
//   type DictEntry = {
//     word: string;
//     pos?: string;
//     article?: "de" | "het";
//     verb?: { past?: string; participle?: string; separable?: boolean };
//     info: { source: string; translation: string; audio?: string; examples?: string }[];
//   };
//
// Word-level facts (article, verb, pos) come from specific sources; everything
// generic (translation/audio/examples) is kept per-source in `info[]` so the
// quality of each source stays visible.
//
// Outputs:
//   public/data/dictionary.json     merged entries
//   public/audio/dict/*.mp3         extracted audio (filenames as referenced)
//
// Run: node scripts/build-dictionary.mjs   (or: npm run build-dictionary)

import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCES = join(ROOT, "sources");
const OUT_JSON = join(ROOT, "public", "data", "dictionary.json");
const OUT_AUDIO = join(ROOT, "public", "audio", "dict");
const WORK = join(tmpdir(), "word-leren-dict-build");

// ---------------------------------------------------------------- text utils

const ENTITIES = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&rsquo;": "’",
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m] ?? m);
}

// Strip [sound:..] tags, turn block tags into newlines, drop the rest, decode.
function cleanHtml(s) {
  if (!s) return "";
  let t = s.replace(/\[sound:[^\]]+\]/g, " ");
  t = t.replace(/<\s*br\s*\/?>/gi, "\n");
  t = t.replace(/<\s*\/?\s*(div|p|li)[^>]*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = decodeEntities(t);
  return t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function oneLine(s) {
  return cleanHtml(s).replace(/\s*\n\s*/g, " ").trim();
}

// Readable display form: peel leading article qualifiers, keep first variant.
// Handles "het rijbewijs" -> "rijbewijs", "het/de dressoir" -> "dressoir",
// "de, het snoep" -> "snoep", while preserving article headwords like
// "het, 't" -> "het" (where the article *is* the word).
function displayWord(raw) {
  let w = cleanHtml(raw).replace(/\s+/g, " ").trim();
  let peeled = w;
  let prev;
  do {
    prev = peeled;
    peeled = peeled.replace(/^(de|het|een)[\s,/]+/i, "");
  } while (peeled !== prev && peeled);
  peeled = peeled.split(/[,/]/)[0].trim();
  if (!peeled || /^['’]/.test(peeled)) {
    return w.split(/[,/]/)[0].trim(); // article/contraction is the headword
  }
  return peeled;
}

// Merge key: case-folded display form.
function lemmaKey(raw) {
  return displayWord(raw).toLowerCase();
}

function soundFiles(raw) {
  return [...(raw || "").matchAll(/\[sound:([^\]]+)\]/g)].map((m) => m[1]);
}

function articleFromText(text) {
  const t = text.toLowerCase();
  if (/\bhet\b/.test(t)) return "het";
  if (/\bde\b/.test(t)) return "de";
  return undefined;
}

// ------------------------------------------------------------------- decks

// Unzip an .apkg, read its notes + media map. Prefers the modern
// collection.anki21 over the legacy collection.anki2 stub.
function loadDeck(filename) {
  const apkg = join(SOURCES, filename);
  const dir = join(WORK, filename.replace(/[^\w.-]/g, "_"));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", apkg, "-d", dir]);

  const dbPath = existsSync(join(dir, "collection.anki21"))
    ? join(dir, "collection.anki21")
    : join(dir, "collection.anki2");
  const db = new DatabaseSync(dbPath);
  const notes = db
    .prepare("SELECT flds FROM notes")
    .all()
    .map((r) => String(r.flds).split("\x1f"));
  db.close();

  // media maps "<number>" -> "filename"; build filename -> absolute temp path
  let mediaByName = {};
  const mediaJson = join(dir, "media");
  if (existsSync(mediaJson)) {
    const map = JSON.parse(readFileSync(mediaJson, "utf-8"));
    for (const [num, name] of Object.entries(map)) {
      mediaByName[name] = join(dir, num);
    }
  }
  return { notes, mediaByName };
}

const audioCopied = new Set();
let audioMissing = 0;

// Copy a referenced media file into public/audio/dict, return "dict/<name>".
function takeAudio(deck, filename) {
  if (!filename) return undefined;
  const dest = join(OUT_AUDIO, filename);
  if (!audioCopied.has(filename)) {
    const src = deck.mediaByName[filename];
    if (!src || !existsSync(src)) {
      audioMissing++;
      return undefined;
    }
    copyFileSync(src, dest);
    audioCopied.add(filename);
  }
  return `dict/${filename}`;
}

// --------------------------------------------------------------- merge core

/** @type {Map<string, any>} */
const dict = new Map();

function entryFor(rawWord) {
  const key = lemmaKey(rawWord);
  if (!key) return null;
  let e = dict.get(key);
  if (!e) {
    e = { word: displayWord(rawWord), info: [] };
    dict.set(key, e);
  }
  return e;
}

function setArticle(e, article) {
  if (article && !e.article) e.article = article;
}

// ------------------------------------------------------------- build steps

function buildFrequency() {
  const deck = loadDeck("A_Frequency_Dictionary_of_Dutch.apkg");
  let n = 0;
  for (const f of deck.notes) {
    // Rank, Word, POS, Definition, Dutch, English, Freq, Word Audio
    const [, word, posRaw, definition, dutch, english, , audioRaw] = f;
    const e = entryFor(word);
    if (!e) continue;
    const pos = oneLine(posRaw);
    if (pos && !e.pos) e.pos = pos.split(/[,(]/)[0].trim();
    if (/\bnoun\b/i.test(pos)) setArticle(e, articleFromText(pos));

    const ex = [oneLine(dutch), oneLine(english)].filter(Boolean).join(" — ");
    const audios = soundFiles(audioRaw);
    audios.forEach((a) => takeAudio(deck, a)); // copy all referenced clips
    e.info.push({
      source: "frequency",
      translation: oneLine(definition),
      ...(audios[0] ? { audio: takeAudio(deck, audios[0]) } : {}),
      ...(ex ? { examples: ex } : {}),
    });
    n++;
  }
  console.log(`  frequency: ${n} notes`);
}

function buildCommon() {
  const deck = loadDeck("LearnDutchorg_-_1000_Most_Common_Words_in_Dutch.apkg");
  let n = 0;
  for (const [front, back] of deck.notes) {
    const e = entryFor(front);
    if (!e) continue;
    const audio = takeAudio(deck, soundFiles(front)[0]);
    e.info.push({
      source: "common",
      translation: oneLine(back),
      ...(audio ? { audio } : {}),
    });
    n++;
  }
  console.log(`  common:    ${n} notes`);
}

function buildVocab() {
  const deck = loadDeck("Dutch_A0-A2_Vocabulary_Words.apkg");
  let n = 0;
  for (const [front, back] of deck.notes) {
    const e = entryFor(front);
    if (!e) continue;
    const lines = cleanHtml(back).split("\n").filter(Boolean);
    const translation = lines.shift() ?? "";
    const examples = lines.join("\n");
    if (/separable/i.test(back)) {
      e.verb = { ...(e.verb || {}), separable: true };
    }
    e.info.push({
      source: "vocab",
      translation,
      ...(examples ? { examples } : {}),
    });
    n++;
  }
  console.log(`  vocab:     ${n} notes`);
}

function buildCsv() {
  const text = readFileSync(join(SOURCES, "Dutch_with_articles.csv"), "utf-8");
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("*")) continue; // skip category headers
    const cols = line.split(";");
    const [english, , dutch] = cols;
    if (!dutch) continue;
    const e = entryFor(dutch);
    if (!e) continue;
    setArticle(e, articleFromText(dutch.split(/\s+/)[0]));
    if (english && english.trim()) {
      e.info.push({ source: "csv", translation: english.trim() });
    }
    n++;
  }
  console.log(`  csv:       ${n} rows`);
}

function buildDeHet() {
  const deck = loadDeck("Dutch_De_vs_Het.apkg");
  let n = 0;
  for (const [front, back] of deck.notes) {
    const e = entryFor(front);
    if (!e) continue;
    setArticle(e, articleFromText(back));
    n++;
  }
  console.log(`  de/het:    ${n} notes (article only)`);
}

function buildIrregular() {
  const deck = loadDeck("Dutch_Irregular_Verbs.apkg");
  let n = 0;
  for (const [front, back] of deck.notes) {
    const e = entryFor(front);
    if (!e) continue;
    // back = "past, pastpl<div>participle</div>"
    const lines = cleanHtml(back).split("\n").filter(Boolean);
    const past = lines[0]?.trim();
    const participle = lines.slice(1).join(" ").trim();
    e.verb = {
      ...(e.verb || {}),
      ...(past ? { past } : {}),
      ...(participle ? { participle } : {}),
    };
    n++;
  }
  console.log(`  irregular: ${n} notes (verb forms only)`);
}

// ------------------------------------------------------------------- main

console.log("Building dictionary…");
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT_AUDIO, { recursive: true });
mkdirSync(join(ROOT, "public", "data"), { recursive: true });

buildFrequency();
buildCommon();
buildVocab();
buildCsv();
buildDeHet();
buildIrregular();

// Sort entries alphabetically by lemma.
const entries = [...dict.entries()]
  .sort(([a], [b]) => a.localeCompare(b, "nl"))
  .map(([, e]) => e);

writeFileSync(OUT_JSON, JSON.stringify(entries, null, 0) + "\n");
rmSync(WORK, { recursive: true, force: true });

// ------------------------------------------------------------------- stats

const withAudio = entries.filter((e) => e.info.some((i) => i.audio)).length;
const withArticle = entries.filter((e) => e.article).length;
const withVerb = entries.filter((e) => e.verb).length;
const withPos = entries.filter((e) => e.pos).length;
console.log("\nDone:");
console.log(`  entries:        ${entries.length}`);
console.log(`  with audio:     ${withAudio}`);
console.log(`  with article:   ${withArticle}`);
console.log(`  with verb:      ${withVerb}`);
console.log(`  with pos:       ${withPos}`);
console.log(`  audio files:    ${audioCopied.size}  (missing refs: ${audioMissing})`);
console.log(`  json:           ${OUT_JSON}`);
console.log(`  audio dir:      ${OUT_AUDIO}`);
