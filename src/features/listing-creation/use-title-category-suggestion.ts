import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { prefetchCategorySuggestion } from "@/lib/category-suggestion.functions";

export type CategorySuggestion = {
  category_id: string;
  parent_id: string | null;
  name_nb: string;
  parent_name_nb: string | null;
};

/**
 * Kategoriforslag fra tittelen: den stemmevektede `suggest_category_for_title`
 * (via prefetchCategorySuggestion), med kallerens `clientCategoryHint` som
 * siste utvei. Delt av salgsflyten (useListingTitleHints) og Ønskes kjøpt.
 */
export function useTitleCategorySuggestion(params: {
  title: string;
  /** Kalleren har valgt kategori selv — forslaget skal da forsvinne. */
  muted: boolean;
  /** Opaque, already-resolved category suggestion computed by the caller
   * (e.g. a vehicle-brand/attribute match on the title — see
   * useVehicleTitleCategoryHint) for when the `suggest_category_for_title`
   * RPC comes back empty. This hook stays vertical-agnostic: it only merges
   * in whatever the caller already resolved. */
  clientCategoryHint?: CategorySuggestion | null;
}) {
  const { title, muted, clientCategoryHint } = params;
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const debouncedTitle = useDebouncedValue((title ?? "").trim(), 400);

  const suggestionsMuted = muted || suggestionDismissed;
  const {
    data,
    isFetching: categorySuggestionLoading,
    isSuccess: categorySuggestionReady,
  } = useQuery({
    queryKey: ["category-suggestion", debouncedTitle],
    enabled: !suggestionsMuted && debouncedTitle.length >= 5,
    staleTime: 120_000,
    queryFn: async (): Promise<CategorySuggestion[]> => {
      const result = await prefetchCategorySuggestion(debouncedTitle);
      return result.suggestions;
    },
  });
  // Avledet, ikke egen state: react-query beholder forrige `data` når spørringen
  // slås av, og et forslag skal forsvinne i samme øyeblikk brukeren velger
  // kategori selv eller lukker det.
  const rpcSuggestions = data ?? [];
  // `clientCategoryHint` er en siste utvei — RPC-ens stemme-/navnetreff får
  // alltid forrang når de faktisk finner noe (f.eks. "sofa"-treffet mot
  // kategorinavnet), og brukes kun når RPC-en kommer tilbake tom (f.eks.
  // «Volvo V70 stasjonsvogn», der verken stemmer eller kategorinavn treffer).
  const categorySuggestions = suggestionsMuted
    ? []
    : rpcSuggestions.length > 0
      ? rpcSuggestions
      : categorySuggestionReady && clientCategoryHint
        ? [clientCategoryHint]
        : [];

  return {
    categorySuggestions,
    categorySuggestionLoading: !suggestionsMuted && categorySuggestionLoading,
    setSuggestionDismissed,
  };
}
