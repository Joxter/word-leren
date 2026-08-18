// Loads and searches the merged Dutch dictionary built by
// scripts/build-dictionary.mjs (served from public/data/dictionary.json).

import { matchTier, type Tiers } from "./search";
import { mergeContained, type Translation } from "./translations";

export type DictInfo = {
  source: string;
  translation: string;
  /** Wiktionary's part of speech for this *sense* ("noun", "verb", "prep"…). */
  pos?: string;
  audio?: string;
  examples?: string;
  synonyms?: string[];
};

export type DictEntry = {
  word: string;
  pos?: string;
  article?: "de" | "het";
  verb?: {
    past?: string;
    pastPl?: string;
    participle?: string;
    separable?: boolean;
  };
  info: DictInfo[];
};

/** The source name build-dictionary tags Wiktionary senses with. */
export const WIKTIONARY = "kaikki";

/**
 * The decks' translations — short, learner-facing, and what a new card's side B
 * is made of. Kept apart from the Wiktionary senses, which are full definitions
 * ("indicates an approximate number") and read as an article, not as an answer.
 */
export function deckInfo(entry: DictEntry): DictInfo[] {
  return entry.info.filter((i) => i.source !== WIKTIONARY);
}

/**
 * The dictionary is keyed by the bare lemma, but a card writes the article into
 * side A ("het huis") and sometimes lists variants ("groot, grote"). This is the
 * same normalisation scripts/build-dictionary.mjs merges its sources by.
 */
function lemmaKey(raw: string): string {
  let word = raw.trim().toLowerCase();
  let prev = "";
  while (word !== prev) {
    prev = word;
    word = word.replace(/^(de|het|een)[\s,/]+/, "");
  }
  return word.split(/[,/]/)[0].trim();
}

/** The entry a card's side A names, if the dictionary has one. */
export function findEntry(
  entries: DictEntry[],
  rawWord: string,
): DictEntry | undefined {
  const key = lemmaKey(rawWord);
  if (!key) return undefined;
  return entries.find((e) => e.word.toLowerCase() === key);
}

/**
 * Wiktionary senses, grouped by part of speech in the order they appear. One
 * word is often several things at once — `punt` is two unrelated nouns, `staan`
 * a verb — and numbering all of that as one flat list reads as nonsense.
 */
export function senseGroups(
  entry: DictEntry,
): { pos?: string; senses: DictInfo[] }[] {
  const groups = new Map<string, { pos?: string; senses: DictInfo[] }>();
  for (const info of entry.info) {
    if (info.source !== WIKTIONARY) continue;
    const key = info.pos ?? "";
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { pos: info.pos, senses: [] }));
    group.senses.push(info);
  }
  return [...groups.values()];
}

// Module-level cache so navigating away and back doesn't refetch the 3.4 MB file.
let cache: DictEntry[] | null = null;
let inflight: Promise<DictEntry[]> | null = null;

export function loadDictionary(): Promise<DictEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch(`${import.meta.env.BASE_URL}data/dictionary.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load dictionary (${r.status})`);
        return r.json();
      })
      .then((data: DictEntry[]) => {
        cache = data;
        return data;
      });
  }
  return inflight;
}

// Audio paths are stored as "dict/<file>.mp3"; clips live under public/audio.
// encodeURI keeps "/" and "'" but escapes spaces (some filenames contain them).
export function audioUrl(audio: string): string {
  return encodeURI(`${import.meta.env.BASE_URL}audio/${audio}`);
}

// Score tiers, best first — hand-picked rather than `rankMatches`' uniform
// per-field bands, because the verb-form tiers have to interleave with the
// others rather than group: hitting an inflected form exactly is a strong
// signal ("gelopen" should surface "lopen" above "afgelopen"), but a substring
// of one is a weak one ("lopen" inside "gelopen"), so it sinks below
// translations.
const EXAMPLE = 9;
const WORD_TIERS: Tiers = [0, 1, 3];
const VERB_TIERS: Tiers = [2, 4, 8];
const TRANS_TIERS: Tiers = [5, 6, 7];

// Search the Dutch headword (bare and article-prefixed, so "de hond" works),
// the past/participle verb forms, translations, and examples — see the tiers
// above for priority. `article` and `pos` are deliberately not searched: they
// are closed-class labels ("de"/"het", "noun"), so matching them would return
// thousands of entries.
// Within the same tier, shorter words rank higher, then alphabetical.
export function searchDictionary(
  entries: DictEntry[],
  rawQuery: string,
  limit = 60,
): DictEntry[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const scored: { entry: DictEntry; score: number }[] = [];
  for (const entry of entries) {
    let score = Math.min(
      matchTier(entry.word, q, WORD_TIERS),
      entry.article
        ? matchTier(`${entry.article} ${entry.word}`, q, WORD_TIERS)
        : Infinity,
    );

    // `past` can list several forms ("beval aan, bevalen aan"), and any of
    // these may carry a parenthesised auxiliary ("(is) gelopen") that must not
    // block an exact match on the form itself. `pastPl` is its own field only
    // for Wiktionary-sourced verbs; the decks packed both into `past`.
    const verbForms = [
      ...(entry.verb?.past?.split(",") ?? []),
      ...(entry.verb?.pastPl?.split(",") ?? []),
      ...(entry.verb?.participle ? [entry.verb.participle] : []),
    ];
    for (const form of verbForms) {
      const clean = form.replace(/\([^)]*\)/g, " ").trim();
      score = Math.min(score, matchTier(clean, q, VERB_TIERS));
    }

    for (const info of entry.info) {
      score = Math.min(score, matchTier(info.translation, q, TRANS_TIERS));
      if (score > EXAMPLE && info.examples?.toLowerCase().includes(q)) {
        score = EXAMPLE;
      }
    }

    if (score !== Infinity) scored.push({ entry, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.word.length - b.entry.word.length ||
      a.entry.word.localeCompare(b.entry.word, "nl"),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

// Unique audio clips for an entry (one per source/recording), in info order.
export function entryAudios(
  entry: DictEntry,
): { url: string; source: string }[] {
  const seen = new Set<string>();
  const out: { url: string; source: string }[] = [];
  for (const info of entry.info) {
    if (info.audio && !seen.has(info.audio)) {
      seen.add(info.audio);
      out.push({ url: audioUrl(info.audio), source: info.source });
    }
  }
  return out;
}

/**
 * The decks' translations for an entry, merged the way a reader wants them:
 * identical texts (case-insensitive) collapse into one row listing every source
 * for them, then a translation fully contained in a longer one is folded into
 * it, so "lock" and "the lock" become just "the lock".
 *
 * Only the decks feed this. Wiktionary's definitions are whole sentences, and
 * merging them in would both bury the short answer and swallow it whole — "on"
 * is contained in "on (positioned at the outer surface of)".
 */
export function entryTranslations(entry: DictEntry): Translation[] {
  const byText = new Map<string, Translation>();
  for (const info of deckInfo(entry)) {
    const text = info.translation?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const existing = byText.get(key);
    if (existing) existing.sources.push(info.source);
    else byText.set(key, { text, sources: [info.source] });
  }
  return mergeContained([...byText.values()]);
}

/**
 * Side A of a card made from this entry: the word with its article, the way
 * the decks write it ("de hond").
 */
export function entryCardFront(entry: DictEntry): string {
  return entry.article ? `${entry.article} ${entry.word}` : entry.word;
}

/**
 * Side B of a card made from this entry: the decks' short translations. Words
 * that only Wiktionary knows (the ERK-A2 additions) have none, so they fall
 * back to its first couple of definitions — long, but a card you can fix beats
 * a button you can't press. Empty when the entry has no meaning at all, which
 * is what the "add" affordances disable themselves on.
 */
export function entryCardBack(entry: DictEntry): string {
  const translations = entryTranslations(entry);
  if (translations.length > 0)
    return translations.map((t) => t.text).join(", ");
  return (
    senseGroups(entry)[0]
      ?.senses.slice(0, 2)
      .map((s) => s.translation)
      .join("; ") ?? ""
  );
}

/**
 * Side A of a card, reduced to a padded run of lowercase words: "De hond!" ->
 * " de hond ". Containment on that is a whole-word test, which is what the
 * "already a card" checks need — a plain substring would call every short word
 * taken, since Dutch builds compounds out of them ("hond" is inside
 * "hondenhok"). The padding is what makes the ends count as boundaries too.
 */
export function wordRun(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/** Every card's `wordRun`, computed once so a whole result list can ask. */
export function cardRuns<T extends { aCard?: string }>(
  cards: T[],
): { run: string; card: T }[] {
  return cards.map((card) => ({ run: wordRun(card.aCard ?? ""), card }));
}

/**
 * The user's own card for a dictionary word, if there is one. Cards are stored
 * with the article on side A ("de hond") and sometimes carry more than that, so
 * the word only has to occur in side A, not be all of it.
 */
export function findOwnCard<T>(
  runs: { run: string; card: T }[],
  word: string,
): T | null {
  const run = wordRun(word);
  return runs.find((c) => c.run.includes(run))?.card ?? null;
}
