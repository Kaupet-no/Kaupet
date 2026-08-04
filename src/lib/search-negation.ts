import type { SynonymMatch } from "@/features/listing-search/use-search-synonym-matches";

/** Norwegian words that negate the phrase immediately following them
 * (e.g. "ikke elbil", "uten hengerfeste"). */
export const NEGATION_WORDS_NB = ["ikke", "uten"];

/**
 * Marks synonym matches immediately preceded by a negation word as
 * `negated`, folding the negation word into the match's word range and
 * `matchedText` so `removeMatchedWords` strips it along with the rest of
 * the phrase, and any UI showing the raw `matchedText` (e.g. the reversible
 * chip list in annonser.tsx) naturally reads "ikke el" instead of just "el".
 */
export function negateSynonymMatches(q: string, matches: SynonymMatch[]): SynonymMatch[] {
  if (matches.length === 0) return matches;
  const words = q.trim().split(/\s+/);
  const consumed = new Set<number>();
  for (const m of matches) {
    for (let i = m.startWord; i <= m.endWord; i++) consumed.add(i);
  }

  return matches.map((m) => {
    const precedingIndex = m.startWord - 1;
    if (precedingIndex < 0 || consumed.has(precedingIndex)) return m;
    const precedingWord = words[precedingIndex]?.toLowerCase();
    if (!precedingWord || !NEGATION_WORDS_NB.includes(precedingWord)) return m;
    return {
      ...m,
      negated: true,
      startWord: precedingIndex,
      matchedText: `${words[precedingIndex]} ${m.matchedText}`,
    };
  });
}
