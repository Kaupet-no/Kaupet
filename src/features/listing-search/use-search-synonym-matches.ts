import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SynonymMatch = {
  /** Index range (inclusive) into the space-split query words this match
   * consumes, so the caller can splice it out of the raw query text. */
  startWord: number;
  endWord: number;
  matchedText: string;
  filterKey: string;
  filterLabel: string;
  /** Null for boolean filters — the filter itself is the value. */
  optionValue: string | null;
  optionLabel: string | null;
  /** Set by search-negation.ts when this match was preceded by a negation
   * word ("ikke"/"uten") — the phrase should exclude rather than select
   * this value. Never set by `fetchSynonymMatches` itself. */
  negated?: boolean;
  /** True for synonyms that are also common words outside their category's
   * vocabulary (e.g. "elektrisk" for fuel_type=el) — see
   * filterAmbiguousMatches for how these are gated when no category is
   * selected. */
  isAmbiguous: boolean;
  /** The matched filter's topmost category ancestor (root), not its direct
   * category — used to corroborate ambiguous matches against another,
   * non-ambiguous match under the same vertical (e.g. "SUV" under Bil
   * corroborating "elektrisk" resolved arbitrarily to Bobil/Motorsykkel,
   * since fuel_type is defined on several sibling vehicle categories and
   * the RPC's DISTINCT ON can land on any one of them — comparing roots
   * instead of the exact leaf category makes that pick irrelevant). */
  categoryId: string | null;
};

const DEBOUNCE_MS = 250;
/** Longest phrase we try to recognize, in words — keeps the n-gram/RPC call
 * small; equipment vocabulary ("adaptiv cruisecontrol") rarely exceeds this. */
const MAX_PHRASE_WORDS = 3;

/** All contiguous word windows up to MAX_PHRASE_WORDS, longest first, with
 * their word-index range so a match can be located back in the raw text. */
function buildNgrams(words: string[]): { text: string; start: number; end: number }[] {
  const ngrams: { text: string; start: number; end: number }[] = [];
  for (let len = Math.min(MAX_PHRASE_WORDS, words.length); len >= 1; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      ngrams.push({ text: words.slice(start, start + len).join(" "), start, end: start + len - 1 });
    }
  }
  return ngrams;
}

/**
 * Recognizes category-attribute vocabulary (e.g. "ryggekamera") typed into
 * free text, via the `match_search_synonyms` RPC and the `filter_synonyms`
 * dictionary — the SQL side owns which phrases are known, this hook only
 * turns "which n-grams of the query match" into a set of non-overlapping,
 * longest-phrase-wins matches the caller can convert into structured
 * attribute filters. Scoped to a single category (with its ancestors) when
 * one is given, which disambiguates vocabulary that means different things
 * in different verticals; pass `categoryId: null` to search every
 * category's vocabulary instead (e.g. no category selected yet on
 * /annonser) — see match_search_synonyms_global.sql for the accepted
 * trade-off this makes.
 */
/**
 * The actual RPC call + n-gram matching, factored out of the `useQuery`
 * wrapper below so it can also be `await`-ed directly outside of React —
 * see resolve-text-to-filters.ts, which reuses this for the native search
 * overlay's one-shot submit (no live debounced hook there).
 */
export async function fetchSynonymMatches(
  categoryId: string | null,
  q: string,
): Promise<SynonymMatch[]> {
  const words = q.trim().length > 0 ? q.trim().split(/\s+/) : [];
  const ngrams = buildNgrams(words);
  if (ngrams.length === 0) return [];

  const { data, error } = await supabase.rpc("match_search_synonyms", {
    p_category_id: categoryId,
    phrases: ngrams.map((n) => n.text),
  });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const byPhrase = new Map(data.map((row) => [row.phrase.toLowerCase(), row]));

  // Greedily accept the longest matched n-gram first, skipping any
  // shorter match whose word range overlaps one already accepted (so
  // "adaptiv cruisecontrol" wins over the "cruisecontrol" it contains).
  const accepted: SynonymMatch[] = [];
  const consumed = new Set<number>();
  for (const ngram of ngrams) {
    const row = byPhrase.get(ngram.text.toLowerCase());
    if (!row) continue;
    const range = Array.from({ length: ngram.end - ngram.start + 1 }, (_, i) => ngram.start + i);
    if (range.some((i) => consumed.has(i))) continue;
    for (const i of range) consumed.add(i);
    accepted.push({
      startWord: ngram.start,
      endWord: ngram.end,
      matchedText: ngram.text,
      filterKey: row.filter_key,
      filterLabel: row.filter_label,
      optionValue: row.option_value,
      optionLabel: row.option_label,
      isAmbiguous: row.is_ambiguous,
      categoryId: row.category_id,
    });
  }
  return filterAmbiguousMatches(accepted, categoryId).sort((a, b) => a.startWord - b.startWord);
}

/**
 * Drops ambiguous synonym matches (e.g. "elektrisk" -> fuel_type=el, which
 * is also just a generic adjective) unless another, non-ambiguous match in
 * the same result set shares its category — i.e. some other Bil-specific
 * signal (body type, brand, ...) is also present in the search. Only
 * applies when no category is already selected/recognized (`categoryId ===
 * null`): once a category is established, the ambiguity is already
 * resolved by that choice, so the gate is skipped.
 */
export function filterAmbiguousMatches(
  matches: SynonymMatch[],
  categoryId: string | null,
): SynonymMatch[] {
  if (categoryId !== null) return matches;
  const corroboratedCategoryIds = new Set(
    matches.filter((m) => !m.isAmbiguous && m.categoryId).map((m) => m.categoryId),
  );
  return matches.filter((m) => !m.isAmbiguous || corroboratedCategoryIds.has(m.categoryId));
}

/**
 * Wraps the query result with the exact (debounced) text it was resolved
 * against — callers that need to re-derive something positional from the
 * matches (e.g. negateSynonymMatches's "word immediately before the match")
 * must use this `debouncedQ`, not the live `q` passed in, since `q` can
 * already have moved on (e.g. a previous match's text was just stripped out)
 * by the time a given match set renders — using the live value there would
 * silently mismatch word indices against a query text the matches were
 * never computed from.
 */
export function useSearchSynonymMatches(categoryId: string | null, q: string) {
  const [debouncedQ, setDebouncedQ] = useState(q.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const words = debouncedQ.length > 0 ? debouncedQ.split(/\s+/) : [];

  const query = useQuery({
    queryKey: ["search-synonym-matches", categoryId, debouncedQ],
    queryFn: () => fetchSynonymMatches(categoryId, debouncedQ),
    enabled: words.length > 0,
    staleTime: 30_000,
  });

  return { ...query, debouncedQ };
}

/** Removes the matched word ranges from the raw query, used to move a
 * recognized phrase out of the free-text search once it's been applied as
 * a structured attribute filter. */
export function removeMatchedWords(q: string, matches: SynonymMatch[]): string {
  if (matches.length === 0) return q;
  const words = q.trim().split(/\s+/);
  const consumed = new Set<number>();
  for (const m of matches) {
    for (let i = m.startWord; i <= m.endWord; i++) consumed.add(i);
  }
  return words.filter((_, i) => !consumed.has(i)).join(" ");
}
