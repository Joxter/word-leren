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

// Search the Dutch headword, translations, and examples.
// Priority: exact word > word prefix > word substring > exact translation >
//   translation prefix > translation substring > example match.
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
    const w = entry.word.toLowerCase();
    let score = Infinity;
    if (w === q) score = 0;
    else if (w.startsWith(q)) score = 1;
    else if (w.includes(q)) score = 2;

    for (const info of entry.info) {
      const t = info.translation.toLowerCase();
      if (t === q) score = Math.min(score, 3);
      else if (t.startsWith(q)) score = Math.min(score, 4);
      else if (t.includes(q)) score = Math.min(score, 5);

      if (score > 6 && info.examples?.toLowerCase().includes(q)) score = 6;
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
