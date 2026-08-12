import { useQuery } from "@tanstack/react-query";

import type { AdvancedSearchValue } from "@/components/advanced-search-value";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Category } from "@/lib/categories";
import type { AttributeFilterValue } from "@/lib/category-filters";
import { encodeAttrFilters, searchSchema } from "@/features/listing-search/search-schema";
import {
  buildListingsSearchRpcArgs,
  runListingsSearch,
} from "@/features/listing-search/listing-search-query";

const DRAFT_COUNT_DEBOUNCE_MS = 350;

type DraftCountInput = {
  draft: AdvancedSearchValue;
  attributes: Record<string, AttributeFilterValue>;
};

export function draftToSearchParams({ draft, attributes }: DraftCountInput) {
  return searchSchema.parse({
    q: draft.terms.join(" "),
    qMode: draft.qMode,
    extraGroups: draft.extraGroups,
    categories: draft.categories,
    catMode: draft.catMode,
    conditions: draft.conditions,
    includeFree: draft.includeFree,
    min: draft.min ?? undefined,
    max: draft.max ?? undefined,
    sort: draft.sort,
    lat: draft.location.lat ?? undefined,
    lng: draft.location.lng ?? undefined,
    radius: draft.location.lat != null ? draft.location.radius : undefined,
    loc: draft.location.label || undefined,
    attrs: encodeAttrFilters(attributes),
  });
}

export function useDraftResultCount({
  draft,
  attributes,
  categories,
  enabled,
}: DraftCountInput & {
  categories: Pick<Category, "id" | "slug" | "parent_id">[];
  enabled: boolean;
}) {
  const liveInput = { draft, attributes };
  const debouncedInput = useDebouncedValue(liveInput, DRAFT_COUNT_DEBOUNCE_MS);
  const liveKey = JSON.stringify(liveInput);
  const debouncedKey = JSON.stringify(debouncedInput);
  const search = draftToSearchParams(debouncedInput);

  const query = useQuery({
    queryKey: ["draft-listing-count", search],
    enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const args = buildListingsSearchRpcArgs({
        search,
        categories,
        effectiveCategories: debouncedInput.draft.categories,
        terms: debouncedInput.draft.terms,
        limit: 1,
        offset: 0,
      });
      if (!args) return 0;
      const rows = await runListingsSearch(args, signal);
      return rows[0]?.total_count ?? 0;
    },
  });

  return {
    count: liveKey === debouncedKey ? query.data : undefined,
    isPending: enabled && (liveKey !== debouncedKey || query.isPending || query.isFetching),
    isError: query.isError,
  };
}
