import { useQuery } from "@tanstack/react-query";

import type { Category } from "@/lib/categories";
import type { AppliedSearchState } from "@/features/listing-search/search-schema";
import { draftToSearchParams } from "@/features/listing-search/use-draft-result-count";
import {
  buildListingsSearchRpcArgs,
  listingsSearchReady,
  runListingsSearch,
} from "@/features/listing-search/listing-search-query";

// ponytail: utvalg av de nyeste treffene via søke-RPC-en, ikke en ekte
// aggregering. Holder for fordelingen og hurtigvalgene; bytt til en egen
// `listing_price_histogram`-RPC (width_bucket over hele treffmengden) hvis
// store kategorier gir skjeve søyler eller nyttelasten merkes.
const PRICE_SAMPLE_SIZE = 300;

/**
 * Priser for søket brukeren redigerer, uten egen pris- og gratisavgrensning —
 * fordelingen skal vise hva som finnes, ikke bare det som allerede er valgt.
 */
export function usePriceSample({
  draft,
  categories,
  enabled,
}: {
  draft: AppliedSearchState;
  categories: Pick<Category, "id" | "slug" | "parent_id">[];
  enabled: boolean;
}) {
  const search = {
    ...draftToSearchParams({
      draft: {
        ...draft,
        value: { ...draft.value, min: null, max: null, includeFree: false },
      },
    }),
    sort: "new" as const,
  };
  return useQuery({
    queryKey: ["listing-price-sample", search],
    enabled: enabled && listingsSearchReady(draft.value.categories, categories),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const args = buildListingsSearchRpcArgs({
        search,
        categories,
        effectiveCategories: draft.value.categories,
        terms: draft.value.terms,
        limit: PRICE_SAMPLE_SIZE,
        offset: 0,
      });
      if (!args) return [];
      const rows = await runListingsSearch(args, signal);
      return rows.flatMap((row) => (row.price_nok && !row.is_free ? [row.price_nok] : []));
    },
  });
}
