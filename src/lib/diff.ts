// Character-level diff of a typed answer against the correct one, used on the
// Learn page to paint the user's mistakes red after reveal.

export type DiffChar = {
  ch: string;
  /**
   * "ok" — typed and correct; "wrong" — typed but mismatched or extra;
   * "missing" — a character of `correct` the user skipped (ch is that
   * correct character, shown as a gap in the typed answer).
   */
  kind: "ok" | "wrong" | "missing";
};

/**
 * Align `typed` against `correct` character by character, using an LCS
 * alignment so a single missing or extra letter doesn't cascade into the
 * whole tail being red. Comparison is case-insensitive.
 */
export function diffTyped(typed: string, correct: string): DiffChar[] {
  const a = [...typed];
  const b = [...correct];
  const eq = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();

  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffChar[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (eq(a[i], b[j])) {
      out.push({ ch: a[i], kind: "ok" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ ch: a[i], kind: "wrong" });
      i++;
    } else {
      out.push({ ch: b[j], kind: "missing" });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ ch: a[i], kind: "wrong" });
  for (; j < b.length; j++) out.push({ ch: b[j], kind: "missing" });
  return out;
}
