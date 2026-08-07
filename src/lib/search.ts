// The ranking every search box in the app shares. Two rules, in this order:
//
//   1. A hit in a more important field beats a hit in a less important one —
//      *any* match on a card's own word outranks even an exact match in its
//      note, so typing a common word doesn't bury the card that word names.
//   2. Within a field, an exact match beats a prefix beats a substring.
//
// Ties go to the shorter label, then alphabetically, which is what makes the
// short word you meant come up before the long compound that contains it.

/** Scores for an exact, prefix and substring match, in that order. Lower wins. */
export type Tiers = [number, number, number];

/**
 * The best score `q` reaches anywhere in `text`, or `Infinity` if it doesn't
 * occur at all. `q` must already be trimmed and lowercased.
 */
export function matchTier(
  text: string | undefined,
  q: string,
  tiers: Tiers,
): number {
  const t = text?.toLowerCase();
  if (!t) return Infinity;
  if (t === q) return tiers[0];
  if (t.startsWith(q)) return tiers[1];
  if (t.includes(q)) return tiers[2];
  return Infinity;
}

export interface RankOptions<T> {
  /**
   * An item's searchable texts, most important first. Each field gets a band of
   * three tiers to itself, so no hit in a later field can outrank any hit in an
   * earlier one.
   */
  fields: (item: T) => (string | undefined)[];
  /** What ties break on: shorter first, then alphabetically. */
  label: (item: T) => string;
  /** Kept unlimited when omitted. */
  limit?: number;
}

/**
 * Keep the items `rawQuery` matches, best first. An empty query matches
 * nothing — every caller is a box that should stay quiet until it is typed in.
 */
export function rankMatches<T>(
  items: T[],
  rawQuery: string,
  { fields, label, limit }: RankOptions<T>,
): T[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const texts = fields(item);
    let score = Infinity;
    for (let i = 0; i < texts.length; i++) {
      const base = i * 3;
      // Fields are ordered, so once the score is at or under this field's best
      // possible tier, nothing further down can improve it.
      if (score <= base) break;
      score = Math.min(
        score,
        matchTier(texts[i], q, [base, base + 1, base + 2]),
      );
    }
    if (score !== Infinity) scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const [x, y] = [label(a.item), label(b.item)];
    return x.length - y.length || x.localeCompare(y, "nl");
  });

  const ranked = scored.map((s) => s.item);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}
