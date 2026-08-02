import type { CategoryFilter } from "@/lib/category-filters";

export type NumericFilterMatch = {
  /** The exact substring matched in the raw query, so it can be spliced out. */
  matchedText: string;
  filterKey: string;
  min?: number;
  max?: number;
};

const MIN_MODIFIERS = ["over", "mer enn", "fra", "minst"];
const MAX_MODIFIERS = ["under", "mindre enn", "opptil", "maks", "maksimalt", "til"];
const MODIFIER_PATTERN = [...MIN_MODIFIERS, ...MAX_MODIFIERS].join("|");

/** Matches "100000", "100 000" or "100.000" — Norwegian thousand separators. */
const NUMBER_PATTERN = String.raw`\d+(?:[ .]\d{3})*`;

function parseNumber(raw: string): number {
  return Number(raw.replace(/[ .]/g, ""));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Recognizes "100000 km", "under 100 000 km", "235 hk", "over 200 hk", and
 * bare 4-digit years ("2021"), converting them into range predicates on the
 * category's own number-type filters (Kilometerstand, Effekt, Årsmodell …).
 * Driven entirely by the category's actual filters (matched by `unit`, or by
 * "år" appearing in the label for year-like fields) — no hardcoded field
 * names, so it works for any category with numeric facts, not just cars.
 *
 * Bare numbers without an explicit "over"/"under" default to an upper bound
 * (max) — colloquial marketplace search ("100000 km") overwhelmingly means
 * "up to", not "at least"; year matches are treated as exact (min = max).
 */
export function parseNumericFilters(
  query: string,
  filters: CategoryFilter[],
): NumericFilterMatch[] {
  const matches: NumericFilterMatch[] = [];
  const consumedRanges: [number, number][] = [];

  const overlaps = (start: number, end: number) =>
    consumedRanges.some(([s, e]) => start < e && end > s);

  const unitFilters = filters.filter((f) => f.type === "number" && f.unit);
  for (const filter of unitFilters) {
    const unit = escapeRegExp(filter.unit!.trim());
    const re = new RegExp(
      `(?:\\b(${MODIFIER_PATTERN})\\s+)?(${NUMBER_PATTERN})\\s*${unit}\\b`,
      "gi",
    );
    for (const m of query.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const value = parseNumber(m[2]);
      const modifier = m[1]?.toLowerCase();
      const isMin = modifier ? MIN_MODIFIERS.includes(modifier) : false;
      const isMax = modifier ? MAX_MODIFIERS.includes(modifier) : true; // bare number defaults to max
      matches.push({
        matchedText: m[0],
        filterKey: filter.key,
        min: isMin ? value : undefined,
        max: isMax ? value : undefined,
      });
      consumedRanges.push([start, end]);
    }
  }

  const yearFilter = filters.find((f) => f.type === "number" && !f.unit && /år/i.test(f.label_nb));
  if (yearFilter) {
    const re = /\b(19[5-9]\d|20\d{2})\b/g;
    for (const m of query.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const value = Number(m[0]);
      matches.push({ matchedText: m[0], filterKey: yearFilter.key, min: value, max: value });
      consumedRanges.push([start, end]);
    }
  }

  return matches;
}

/** Removes every matched substring from the raw query, collapsing the
 * resulting whitespace gaps. */
export function removeNumericMatches(query: string, matches: NumericFilterMatch[]): string {
  if (matches.length === 0) return query;
  let result = query;
  // Longest-first so removing one match doesn't corrupt the index of a
  // shorter one nested inside it (shouldn't happen given overlap guards
  // above, but keeps this function safe to reuse independently).
  const sorted = [...matches].sort((a, b) => b.matchedText.length - a.matchedText.length);
  for (const m of sorted) {
    result = result.replace(m.matchedText, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}
