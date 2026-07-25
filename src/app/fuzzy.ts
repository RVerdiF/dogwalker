/**
 * Subsequence fuzzy matching for the File Tree name search (PRODUCT.md §8).
 * Pure and DOM-free so the scoring is testable. `fuzzyScore` returns a rank
 * (higher is better) or null when the query isn't a subsequence of the target;
 * consecutive runs and matches right after a separator score higher, so
 * "ftn" ranks FileTreeNode above a scattered hit.
 */
const SEPARATORS = new Set(['/', '\\', '.', '-', '_', ' ']);

export function fuzzyScore(query: string, target: string): number | null {
  if (query === '') return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let run = 0;
  let prevSep = true;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (run > 0) score += run * 2; // reward consecutive matches
      if (prevSep) score += 3; // reward start-of-segment matches
      if (target[ti] === query[qi]) score += 1; // exact-case nicety
      run += 1;
      qi += 1;
    } else {
      run = 0;
    }
    prevSep = SEPARATORS.has(t[ti]);
  }
  if (qi < q.length) return null;
  // Prefer shorter targets for the same match quality.
  return score - t.length * 0.01;
}

export interface Scored<T> {
  item: T;
  score: number;
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
  limit = 200,
): T[] {
  const scored: Scored<T>[] = [];
  for (const item of items) {
    const s = fuzzyScore(query, key(item));
    if (s !== null) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
