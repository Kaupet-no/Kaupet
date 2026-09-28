import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  prefetchCategorySuggestion,
  suggestCategoryForTitleWithAi,
} from "@/lib/category-suggestion.functions";

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
  /** Sender tittelen til Mistral (suggestCategoryForTitleWithAi) når
   * stemmene og `clientCategoryHint` ikke fant noe. `enabled` styrer når —
   * f.eks. bare på kategoristeget, så det ikke går et kall per tastetrykk. */
  aiFallback?: { enabled: boolean; getToken: () => Promise<string | null> };
}) {
  const { title, muted, clientCategoryHint, aiFallback } = params;
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const trimmedTitle = (title ?? "").trim();
  const debouncedTitle = useDebouncedValue(trimmedTitle, 400);

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
  const localSuggestions = suggestionsMuted
    ? []
    : rpcSuggestions.length > 0
      ? rpcSuggestions
      : categorySuggestionReady && clientCategoryHint
        ? [clientCategoryHint]
        : [];

  const localSettledEmpty =
    categorySuggestionReady &&
    !categorySuggestionLoading &&
    debouncedTitle === trimmedTitle &&
    localSuggestions.length === 0;
  const { data: aiSuggestions = [], isFetching: aiLoading } = useQuery({
    queryKey: ["category-suggestion-ai", debouncedTitle],
    enabled: !!aiFallback?.enabled && !suggestionsMuted && localSettledEmpty,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<CategorySuggestion[]> => {
      const turnstileToken = await aiFallback!.getToken();
      if (!turnstileToken) return [];
      const result = await suggestCategoryForTitleWithAi({
        data: { title: debouncedTitle, turnstileToken },
      });
      return result.suggestions;
    },
  });
  const categorySuggestions =
    !aiFallback?.enabled || !localSettledEmpty || suggestionsMuted
      ? localSuggestions
      : aiSuggestions;

  return {
    categorySuggestions,
    categorySuggestionLoading: !suggestionsMuted && categorySuggestionLoading,
    /** Som `categorySuggestionLoading`, men også sann mens tittelen venter på
     * debounce — for et steg som åpnes rett etter at tittelen er skrevet og
     * ellers ville blinket «ingen forslag» før spørringen i det hele tatt starter. */
    categorySuggestionPending:
      !suggestionsMuted &&
      (categorySuggestionLoading ||
        (!!aiFallback?.enabled && aiLoading) ||
        (trimmedTitle.length >= 5 && trimmedTitle !== debouncedTitle)),
    setSuggestionDismissed,
  };
}
