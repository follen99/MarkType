/**
 * Fuzzy matching for quick open: every query character must appear in order. Matches score higher when
 * they are consecutive, at word starts, or in the file name rather than in the folder path.
 */

export interface FuzzyMatch {
  score: number;
  /** Indices of the matched characters in the candidate. */
  positions: number[];
}

const WORD_START = /[\s/\\._-]/;

export function fuzzyMatch(query: string, candidate: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, positions: [] };
  const text = candidate.toLowerCase();
  const nameStart = Math.max(candidate.lastIndexOf('/'), candidate.lastIndexOf('\\')) + 1;

  // Prefer matching inside the file name: try from the name first, then from the start.
  const attempt = (from: number): FuzzyMatch | null => {
    const positions: number[] = [];
    let score = 0;
    let index = from;
    let previous = -2;
    for (const char of q) {
      const found = text.indexOf(char, index);
      if (found < 0) return null;
      positions.push(found);
      score += 1;
      if (found === previous + 1) score += 5;
      if (found === 0 || WORD_START.test(candidate[found - 1] ?? '')) score += 3;
      if (found >= nameStart) score += 2;
      previous = found;
      index = found + 1;
    }
    // Shorter candidates and earlier matches are better.
    score -= candidate.length * 0.01 + (positions[0] ?? 0) * 0.02;
    return { score, positions };
  };

  const inName = nameStart > 0 ? attempt(nameStart) : null;
  const anywhere = attempt(0);
  if (inName && anywhere) return inName.score >= anywhere.score ? inName : anywhere;
  return inName ?? anywhere;
}

export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string, limit = 50) {
  const scored: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, text(item));
    if (match) scored.push({ item, match });
  }
  scored.sort((a, b) => b.match.score - a.match.score);
  return scored.slice(0, limit);
}
