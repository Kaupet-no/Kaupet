import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import { getAttributeChipState } from "@/lib/filter-chip-labels";
import type { CategoryFilter } from "@/lib/category-filters";
import type { Category } from "@/lib/categories";
import type { AppliedSearchState } from "./search-schema";
import { countDraftListings, draftToSearchParams } from "./use-draft-result-count";

export type ZeroResultExpansion = {
  key: string;
  label: string;
  applied: AppliedSearchState;
  count: number;
};

type Candidate = Omit<ZeroResultExpansion, "count">;

function withoutAttribute(applied: AppliedSearchState, key: string): AppliedSearchState {
  const attributes = { ...applied.attributes };
  delete attributes[key];
  return { ...applied, attributes };
}

export function buildZeroResultCandidates(
  applied: AppliedSearchState,
  filters: CategoryFilter[],
  canRemoveCategory = true,
): Candidate[] {
  const candidates: Candidate[] = Object.entries(applied.attributes).map(([key, value]) => {
    const filter = filters.find((item) => item.key === key);
    return {
      key: `attribute:${key}`,
      label: filter ? getAttributeChipState(filter, value).label : key,
      applied: withoutAttribute(applied, key),
    };
  });
  const nextValue = (patch: Partial<AppliedSearchState["value"]>): AppliedSearchState => ({
    ...applied,
    value: { ...applied.value, ...patch },
  });

  if (applied.value.conditions.length > 0) {
    candidates.push({
      key: "conditions",
      label: "tilstandsfilteret",
      applied: nextValue({ conditions: [] }),
    });
  }
  if (applied.value.min != null || applied.value.max != null || !applied.value.includeFree) {
    candidates.push({
      key: "price",
      label: "prisfilteret",
      applied: nextValue({ min: null, max: null, includeFree: true }),
    });
  }
  if (applied.value.location.lat != null) {
    candidates.push({
      key: "location",
      label: applied.value.location.label || "stedsfilteret",
      applied: nextValue({
        location: { ...applied.value.location, lat: null, lng: null, label: "" },
      }),
    });
  }
  if (canRemoveCategory && applied.value.categories.length > 0) {
    candidates.push({
      key: "categories",
      label: "kategorifilteret",
      applied: nextValue({ categories: [] }),
    });
  }
  applied.value.extraGroups.forEach((group, index) => {
    candidates.push({
      key: `group:${group.id}`,
      label: "en presis søkegruppe",
      applied: nextValue({
        extraGroups: applied.value.extraGroups.filter(
          (_, candidateIndex) => candidateIndex !== index,
        ),
      }),
    });
  });
  if (applied.value.terms.length > 1) {
    applied.value.terms.forEach((term, index) => {
      candidates.push({
        key: `term:${index}`,
        label: term,
        applied: nextValue({
          terms: applied.value.terms.filter((_, candidateIndex) => candidateIndex !== index),
        }),
      });
    });
  }

  // ponytail: cap parallel count calls; add one batched RPC if real searches routinely exceed this.
  return candidates.slice(0, 12);
}

export function bestZeroResultExpansion(
  candidates: Candidate[],
  counts: Array<number | undefined>,
): ZeroResultExpansion | undefined {
  return candidates.reduce<ZeroResultExpansion | undefined>((best, candidate, index) => {
    const count = counts[index];
    return count != null && count > 0 && (!best || count > best.count)
      ? { ...candidate, count }
      : best;
  }, undefined);
}

export function useZeroResultExpansion({
  applied,
  filters,
  categories,
  enabled,
  canRemoveCategory = true,
}: {
  applied: AppliedSearchState;
  filters: CategoryFilter[];
  categories: Pick<Category, "id" | "slug" | "parent_id">[];
  enabled: boolean;
  canRemoveCategory?: boolean;
}) {
  const candidates = useMemo(
    () => buildZeroResultCandidates(applied, filters, canRemoveCategory),
    [applied, filters, canRemoveCategory],
  );
  const queries = useQueries({
    queries: candidates.map((candidate) => ({
      queryKey: ["draft-listing-count", draftToSearchParams({ draft: candidate.applied })],
      enabled,
      staleTime: 30_000,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        countDraftListings({ draft: candidate.applied, categories }, signal),
    })),
  });

  return {
    expansion: bestZeroResultExpansion(
      candidates,
      queries.map((query) => query.data),
    ),
    isPending: enabled && queries.some((query) => query.isPending || query.isFetching),
  };
}
