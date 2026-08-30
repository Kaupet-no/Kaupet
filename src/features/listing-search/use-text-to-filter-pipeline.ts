import { useEffect, useMemo } from "react";
import { useSearchSynonymMatches, removeMatchedWords } from "./use-search-synonym-matches";
import {
  parseNumericFilters,
  parsePriceFilters,
  removeNumericMatches,
} from "@/lib/search-number-parser";
import { negateSynonymMatches } from "@/lib/search-negation";
import { stripFillerWords } from "@/lib/search-stopwords";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import type { InterpretedCriterion } from "./resolve-text-to-filters";
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
  allFilters,
  attrValues,
  handleAttrValueChange,
  categoryId,
  min,
  max,
  onApplied,
  onInterpreted,
  ignoredInterpretations,
}: {
  qDraft: string;
  setQDraft: (q: string) => void;
  updateSearch: (patch: { q: string; min?: number; max?: number }) => void;
  attrFilters: CategoryFilter[];
  /** Every category's filters, unscoped — used only to look up a matched
   * key's filter `type` (select/multiselect/boolean) when no category is
   * selected yet, so `attrFilters` (which is category-scoped and empty in
   * that case) still has something to check the match against. Synonym
   * matching itself already searches globally when `categoryId` is null
   * (see use-search-synonym-matches.ts); this just lets the result actually
   * get applied instead of being dropped for lack of a known filter type. */
  allFilters: CategoryFilter[];
  attrValues: Record<string, AttributeFilterValue>;
  handleAttrValueChange: (key: string, value: AttributeFilterValue | undefined) => void;
  categoryId: string | null;
  min?: number;
  max?: number;
  /** Composite "filterKey:optionValue" ("filterKey:" for single-value
   * filters) -> the original matched text, for reversible UI state. */
  onApplied?: (applied: Record<string, string>) => void;
  /** Structured criteria recognized from the query, kept separate from the
   * mutation callback so the UI can explain and undo interpretation. */
  onInterpreted?: (criteria: InterpretedCriterion[]) => void;
  /** Phrases the user explicitly removed; they remain text until edited. */
  ignoredInterpretations?: Set<string>;
}) {
  const { data: rawSynonymMatches, debouncedQ: matchedQ } = useSearchSynonymMatches(
    categoryId,
    qDraft,
  );
  const synonymMatches = useMemo(
    () =>
      rawSynonymMatches ? negateSynonymMatches(matchedQ, rawSynonymMatches) : rawSynonymMatches,
    [matchedQ, rawSynonymMatches],
  );
  // Matched against the same debounced text as the synonym matcher (not the
  // live qDraft) so a number isn't auto-stripped from the box mid-keystroke
  // (e.g. "300" matching before the user finishes typing "3000").
  const numericFilters = useMemo(() => {
    if (attrFilters.some((filter) => filter.type === "number" && filter.unit === "km")) {
      return attrFilters;
    }
    const mileageFilters = allFilters.filter(
      (filter) => filter.type === "number" && filter.unit === "km",
    );
    return mileageFilters.length > 0 ? [...attrFilters, ...mileageFilters] : attrFilters;
  }, [allFilters, attrFilters]);
  const numericMatches = useMemo(
    () => parseNumericFilters(matchedQ, numericFilters),
    [matchedQ, numericFilters],
  );
  const priceMatches = useMemo(() => parsePriceFilters(matchedQ), [matchedQ]);
  const activeSynonymMatches = useMemo(
    () =>
      synonymMatches?.filter(
        (match) => !ignoredInterpretations?.has(match.matchedText.toLocaleLowerCase()),
      ),
    [ignoredInterpretations, synonymMatches],
  );
  const activeNumericMatches = useMemo(
    () =>
      numericMatches.filter(
        (match) => !ignoredInterpretations?.has(match.matchedText.toLocaleLowerCase()),
      ),
    [ignoredInterpretations, numericMatches],
  );
  const activePriceMatches = useMemo(
    () =>
      priceMatches.filter(
        (match) => !ignoredInterpretations?.has(match.matchedText.toLocaleLowerCase()),
      ),
    [ignoredInterpretations, priceMatches],
  );

  useEffect(() => {
    const hasSynonyms = !!activeSynonymMatches && activeSynonymMatches.length > 0;
    const hasNumeric = activeNumericMatches.length > 0;
    const hasPrice = activePriceMatches.length > 0;
    if (!hasSynonyms && !hasNumeric && !hasPrice) return;

    const applied: Record<string, string> = {};
    const criteria: InterpretedCriterion[] = [];

    if (hasSynonyms) {
      for (const m of activeSynonymMatches!) {
        const filter =
          attrFilters.find((f) => f.key === m.filterKey) ??
          allFilters.find((f) => f.key === m.filterKey);
        if (!filter) continue;
        if (m.negated) {
          if ((filter.type === "select" || filter.type === "multiselect") && m.optionValue) {
            const current = attrValues[m.filterKey];
            const values = current?.kind === "exclude" ? current.values : [];
            if (!values.includes(m.optionValue)) {
              handleAttrValueChange(m.filterKey, {
                kind: "exclude",
                values: [...values, m.optionValue],
              });
            }
            applied[`${m.filterKey}:!${m.optionValue}`] = m.matchedText;
            criteria.push({
              kind: "attribute",
              key: m.filterKey,
              value: { kind: "exclude", values: [m.optionValue] },
              source: "text",
              matchedText: m.matchedText,
            });
          }
          continue;
        }
        if (filter.type === "boolean") {
          handleAttrValueChange(m.filterKey, { kind: "boolean", value: true });
          applied[`${m.filterKey}:`] = m.matchedText;
          criteria.push({
            kind: "attribute",
            key: m.filterKey,
            value: { kind: "boolean", value: true },
            source: "text",
            matchedText: m.matchedText,
          });
        } else if (filter.type === "select" && m.optionValue) {
          handleAttrValueChange(m.filterKey, { kind: "select", value: m.optionValue });
          applied[`${m.filterKey}:`] = m.matchedText;
          criteria.push({
            kind: "attribute",
            key: m.filterKey,
            value: { kind: "select", value: m.optionValue },
            source: "text",
            matchedText: m.matchedText,
          });
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
          criteria.push({
            kind: "attribute",
            key: m.filterKey,
            value: { kind: "multiselect", values: [m.optionValue] },
            source: "text",
            matchedText: m.matchedText,
          });
        }
      }
    }

    if (hasNumeric) {
      for (const m of activeNumericMatches) {
        const current = attrValues[m.filterKey];
        const currentRange: { min?: number; max?: number } =
          current?.kind === "range" ? current : {};
        const value = {
          kind: "range" as const,
          min: m.min ?? currentRange.min,
          max: m.max ?? currentRange.max,
        };
        handleAttrValueChange(m.filterKey, value);
        applied[`${m.filterKey}:`] = m.matchedText;
        criteria.push({
          kind: "attribute",
          key: m.filterKey,
          value,
          source: "text",
          matchedText: m.matchedText,
        });
      }
    }
    let nextMin = min;
    let nextMax = max;
    if (hasPrice) {
      for (const m of activePriceMatches) {
        nextMin = m.min ?? nextMin;
        nextMax = m.max ?? nextMax;
      }
      criteria.push({
        kind: "price",
        min: nextMin,
        max: nextMax,
        source: "text",
        matchedText: activePriceMatches.map((m) => m.matchedText).join(" "),
      });
    }

    onInterpreted?.(criteria);
    if (Object.keys(applied).length > 0) onApplied?.(applied);

    let nextQ = qDraft;
    if (hasSynonyms) nextQ = removeMatchedWords(nextQ, activeSynonymMatches!);
    if (hasNumeric) nextQ = removeNumericMatches(nextQ, activeNumericMatches);
    if (hasPrice) {
      nextQ = removeNumericMatches(
        nextQ,
        activePriceMatches.map((m) => ({ ...m, filterKey: "__price" })),
      );
    }
    nextQ = stripFillerWords(nextQ);
    if (nextQ !== qDraft || hasPrice) {
      setQDraft(nextQ);
      updateSearch({
        q: nextQ,
        ...(hasPrice ? { min: nextMin, max: nextMax } : {}),
      });
    }
    // Runs once per resolved match set; re-triggers naturally once qDraft
    // changes again as a result of applying it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSynonymMatches, activeNumericMatches, activePriceMatches]);
}
