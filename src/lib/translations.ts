// Helpers for combining the translations shown on a dictionary entry / card.

export interface Translation {
  text: string;
  sources: string[];
}

// Collapse translations that are equal to, or fully contained (as a substring)
// in, a longer one ("lock" -> "the lock"), keeping the longer text and folding
// the dropped one's sources into it. Each translation is compared as one atomic
// string (lowercased, whitespace-collapsed). Original (info) order is preserved
// among the survivors.
export function mergeContained(items: Translation[]): Translation[] {
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const enriched = items.map((it, idx) => ({ ...it, idx, key: norm(it.text) }));
  // Consider longest first so a shorter variant collapses into its longer host.
  const byLength = [...enriched].sort((a, b) => b.key.length - a.key.length);
  const kept: typeof enriched = [];
  for (const it of byLength) {
    const host = kept.find((k) => k.key.includes(it.key));
    if (host) {
      for (const s of it.sources)
        if (!host.sources.includes(s)) host.sources.push(s);
    } else {
      kept.push(it);
    }
  }
  return kept
    .sort((a, b) => a.idx - b.idx)
    .map(({ text, sources }) => ({ text, sources }));
}
