// Loads and searches the merged Dutch dictionary built by
// scripts/build-dictionary.mjs (served from public/data/dictionary.json).

export type DictInfo = {
  source: string;
  translation: string;
  audio?: string;
  examples?: string;
};

export type DictEntry = {
  word: string;
  pos?: string;
  article?: "de" | "het";
  verb?: { past?: string; participle?: string; separable?: boolean };
  info: DictInfo[];
};

// Module-level cache so navigating away and back doesn't refetch the 1.7 MB file.
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

// Score tiers, best first. The verb-form tiers are interleaved with the others
// rather than grouped: hitting an inflected form exactly is a strong signal
// ("gelopen" should surface "lopen" above "afgelopen"), but a substring of one
// is a weak one ("lopen" inside "gelopen"), so it sinks below translations.
const EXAMPLE = 9;
const WORD_TIERS: Tiers = [0, 1, 3];
const VERB_TIERS: Tiers = [2, 4, 8];
const TRANS_TIERS: Tiers = [5, 6, 7];

/** Scores for an exact, prefix and substring match, in that order. */
type Tiers = [number, number, number];

function tier(text: string | undefined, q: string, tiers: Tiers): number {
  if (!text) return Infinity;
  const t = text.toLowerCase();
  if (t === q) return tiers[0];
  if (t.startsWith(q)) return tiers[1];
  if (t.includes(q)) return tiers[2];
  return Infinity;
}

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
      tier(entry.word, q, WORD_TIERS),
      entry.article
        ? tier(`${entry.article} ${entry.word}`, q, WORD_TIERS)
        : Infinity,
    );

    // `past` can list several forms ("beval aan, bevalen aan"), and either
    // field may carry a parenthesised auxiliary ("(is) gelopen") that must not
    // block an exact match on the form itself.
    const verbForms = [
      ...(entry.verb?.past?.split(",") ?? []),
      ...(entry.verb?.participle ? [entry.verb.participle] : []),
    ];
    for (const form of verbForms) {
      const clean = form.replace(/\([^)]*\)/g, " ").trim();
      score = Math.min(score, tier(clean, q, VERB_TIERS));
    }

    for (const info of entry.info) {
      score = Math.min(score, tier(info.translation, q, TRANS_TIERS));
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
