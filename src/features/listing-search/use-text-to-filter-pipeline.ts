import { useEffect, useMemo } from "react";
import { useSearchSynonymMatches, removeMatchedWords } from "./use-search-synonym-matches";
import { parseNumericFilters, removeNumericMatches } from "@/lib/search-number-parser";
import { stripFillerWords } from "@/lib/search-stopwords";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

/**
 * Single coordination point for every "recognize this typed word as a
 * structured filter" matcher (equipment/attribute synonyms, number+unit
 * facts) — replaces what used to be two independent `useEffect`s in each
 * page, each reacting to its own memoized/async match set and each
 * computing its own `nextQ` off whatever `qDraft` happened to be in its
 * closure. Running two side-by-side risked one effect's text-stripping
 * clobbering the other's if both resolved in the same render pass (e.g.
 * "under 3000 automat" matching a numeric range AND an equipment synonym
 * at once). Here both match sets are applied, and the query text stripped,
 * in one atomic pass over the same `qDraft` snapshot.
 *
 * Category-name recognition (see search-category-match.ts) deliberately
 * stays outside this pipeline — unlike these two, it doesn't silently
 * auto-apply (a full category navigation is too disruptive for that; see
 * the confirmation-chip flow in annonser.tsx), so it has no query-text
 * mutation to coordinate here.
 */
export function useTextToFilterPipeline({
  qDraft,
  setQDraft,
  updateSearch,
  attrFilters,
  attrValues,
  handleAttrValueChange,
  categoryId,
  onApplied,
}: {
  qDraft: string;
  setQDraft: (q: string) => void;
  updateSearch: (patch: { q: string }) => void;
  attrFilters: CategoryFilter[];
  attrValues: Record<string, AttributeFilterValue>;
  handleAttrValueChange: (key: string, value: AttributeFilterValue | undefined) => void;
  categoryId: string | null;
  /** Composite "filterKey:optionValue" ("filterKey:" for single-value
   * filters) -> the original matched text, for callers that track
   * reversibility (autoAppliedText) and/or a just-applied flash animation. */
  onApplied?: (applied: Record<string, string>) => void;
}) {
  const { data: synonymMatches } = useSearchSynonymMatches(categoryId, qDraft);
  const numericMatches = useMemo(
    () => parseNumericFilters(qDraft, attrFilters),
    [qDraft, attrFilters],
  );

  useEffect(() => {
    const hasSynonyms = !!synonymMatches && synonymMatches.length > 0;
    const hasNumeric = numericMatches.length > 0;
    if (!hasSynonyms && !hasNumeric) return;

    const applied: Record<string, string> = {};

    if (hasSynonyms) {
      for (const m of synonymMatches!) {
        const filter = attrFilters.find((f) => f.key === m.filterKey);
        if (!filter) continue;
        if (filter.type === "boolean") {
          handleAttrValueChange(m.filterKey, { kind: "boolean", value: true });
          applied[`${m.filterKey}:`] = m.matchedText;
        } else if (filter.type === "select" && m.optionValue) {
          handleAttrValueChange(m.filterKey, { kind: "select", value: m.optionValue });
          applied[`${m.filterKey}:`] = m.matchedText;
        } else if (filter.type === "multiselect" && m.optionValue) {
          const current = attrValues[m.filterKey];
          const values = current?.kind === "multiselect" ? current.values : [];
          if (!values.includes(m.optionValue)) {
            handleAttrValueChange(m.filterKey, {
              kind: "multiselect",
              values: [...values, m.optionValue],
            });
          }
          applied[`${m.filterKey}:${m.optionValue}`] = m.matchedText;
        }
      }
    }

    if (hasNumeric) {
      for (const m of numericMatches) {
        const current = attrValues[m.filterKey];
        const currentRange: { min?: number; max?: number } =
          current?.kind === "range" ? current : {};
        handleAttrValueChange(m.filterKey, {
          kind: "range",
          min: m.min ?? currentRange.min,
          max: m.max ?? currentRange.max,
        });
        applied[`${m.filterKey}:`] = m.matchedText;
      }
    }

    if (Object.keys(applied).length > 0) onApplied?.(applied);

    // Both removals run against the same `qDraft` snapshot in one pass, so
    // neither can clobber the other's result.
    let nextQ = qDraft;
    if (hasSynonyms) nextQ = removeMatchedWords(nextQ, synonymMatches!);
    if (hasNumeric) nextQ = removeNumericMatches(nextQ, numericMatches);
    nextQ = stripFillerWords(nextQ);
    if (nextQ !== qDraft) {
      setQDraft(nextQ);
      updateSearch({ q: nextQ });
    }
    // Runs once per resolved match set; re-triggers naturally once qDraft
    // changes again as a result of applying it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synonymMatches, numericMatches]);
}
