import { useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Category } from "@/lib/categories";
import {
  writeAppliedSearchState,
  type AppliedSearchState,
} from "@/features/listing-search/search-schema";
import {
  buildListingsSearchRpcArgs,
  runListingsSearch,
} from "@/features/listing-search/listing-search-query";

const DRAFT_COUNT_DEBOUNCE_MS = 350;

type DraftCountInput = { draft: AppliedSearchState };

export function draftToSearchParams({ draft }: DraftCountInput) {
  return writeAppliedSearchState(draft);
}

export function useDraftResultCount({
  draft,
  categories,
  enabled,
}: DraftCountInput & {
  categories: Pick<Category, "id" | "slug" | "parent_id">[];
  enabled: boolean;
}) {
  const liveInput = { draft };
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
        effectiveCategories: debouncedInput.draft.value.categories,
        terms: debouncedInput.draft.value.terms,
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
