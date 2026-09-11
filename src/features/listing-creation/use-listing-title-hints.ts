import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { prefetchCategorySuggestion } from "@/lib/category-suggestion.functions";
import { suggestKeywordsForListing } from "@/lib/keyword-suggestion.functions";
import { matchWtbListingsForListing } from "@/lib/wtb-listings.functions";
import type { AttributeMap } from "@/components/attribute-fields";

export const SIMILAR_STOPWORDS = new Set([
  "og",
  "er",
  "en",
  "et",
  "ei",
  "i",
  "på",
  "med",
  "til",
  "av",
  "for",
  "som",
  "fra",
  "har",
  "den",
  "det",
  "de",
  "vi",
  "du",
  "kan",
  "ikke",
  "seg",
  "han",
  "hun",
  "men",
  "om",
  "så",
  "ut",
  "enn",
  "da",
  "når",
  "at",
  "dem",
  "sin",
  "hva",
  "ved",
  "var",
  "ny",
  "nye",
  "god",
  "fin",
  "fine",
  "pen",
  "pent",
  "pene",
  "lite",
  "litt",
  "stor",
  "store",
  "liten",
  "billig",
  "rimelig",
  "rask",
  "raskt",
  "gammel",
  "brukt",
  "selger",
  "selges",
  "kjøper",
  "kjøpes",
  "pris",
]);

type CategorySuggestion = {
  category_id: string;
  parent_id: string | null;
  name_nb: string;
  parent_name_nb: string | null;
};

/**
 * Alt annonseveiviseren utleder fra tittelen mens brukeren skriver: et
 * debouncet kategoriforslag, «lignende annonser finnes allerede»-hint,
 * ØK-treff (want-to-buy) og nøkkelordforslag.
 *
 * Alle tre debouncene går via `useDebouncedValue`, som debouncer på innhold
 * i stedet for referanse — det er poenget for ØK-inputene, der `attributes`
 * er et nytt objekt ved hver render.
 */
export function useListingTitleHints(params: {
  title: string;
  description: string | undefined;
  categoryId: string;
  categoryTouchedManually: boolean;
  setSelectedParentId: (id: string) => void;
  setCategoryTouchedManually: (touched: boolean) => void;
  excludeListingId?: string;
  /** Prisstegets pågående verdier — brukes kun til det attributtbaserte
   * ØK-treff-banneret (wtbMatch), ikke til de andre hintene i denne hooken. */
  priceNok?: number | undefined;
  isFree?: boolean;
  attributes?: AttributeMap;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any, options?: any) => void;
}) {
  const {
    title,
    description,
    categoryId,
    categoryTouchedManually,
    setSelectedParentId,
    setCategoryTouchedManually,
    excludeListingId,
    priceNok,
    isFree,
    attributes,
    setValue,
  } = params;

  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const debouncedTitle = useDebouncedValue((title ?? "").trim(), 400);

  const suggestionsMuted = categoryTouchedManually || suggestionDismissed;
  const { data, isFetching: categorySuggestionLoading } = useQuery({
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
  const categorySuggestions = suggestionsMuted ? [] : (data ?? []);

  /** `suggestedCategoryId` må være en av `categorySuggestions` sine id-er —
   * lar kalleren (category-confirm, eller «Bruk forslag»-chipen i
   * category-select) bruke den av (inntil 2) kandidatene brukeren valgte. */
  function applyCategorySuggestion(suggestedCategoryId: string) {
    const suggestion = categorySuggestions.find((s) => s.category_id === suggestedCategoryId);
    if (!suggestion) return;
    setSelectedParentId(suggestion.parent_id ?? suggestion.category_id);
    setValue("category_id", suggestion.category_id, { shouldValidate: true });
    setCategoryTouchedManually(true);
    // Egen state i tillegg til kallerens `categoryTouchedManually`, slik at
    // forslaget forsvinner uten å være avhengig av at kalleren propagerer
    // flagget tilbake i neste render.
    setSuggestionDismissed(true);
  }

  const debouncedHintTitle = useDebouncedValue(title ?? "", 800);

  const { data: similarListings } = useQuery({
    queryKey: ["similar-listings", categoryId, debouncedHintTitle],
    enabled: debouncedHintTitle.length >= 5 && !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const significantWords = debouncedHintTitle
        .toLowerCase()
        .replace(/[^a-zæøå0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !SIMILAR_STOPWORDS.has(w));
      if (significantWords.length === 0) return [];
      let q = supabase
        .from("listings")
        .select("id, title, price_nok, is_free, city")
        .eq("category_id", categoryId)
        .eq("status", "active");
      if (excludeListingId) q = q.neq("id", excludeListingId);
      const { data } = await q
        .textSearch("search_vector", significantWords.join(" "), {
          config: "norwegian",
          type: "plain",
        })
        .limit(3);
      return data ?? [];
    },
  });

  // Egen debounce for det attributtbaserte ØK-treff-banneret: den skal reagere
  // på pris/attributter i tillegg til tittel (ofte kjent først i pris-steget,
  // etter at kategori/attributter allerede er fylt ut), men uten å påvirke
  // debouncedHintTitle-drevne similarListings/keywordSuggestions ovenfor.
  const debouncedWtbInputs = useDebouncedValue({ title, priceNok, isFree, attributes }, 800);

  const matchWtbFn = useServerFn(matchWtbListingsForListing);
  const { data: wtbMatch } = useQuery({
    queryKey: [
      "wtb-match",
      categoryId ?? null,
      debouncedWtbInputs.title,
      debouncedWtbInputs.priceNok ?? null,
      debouncedWtbInputs.isFree ?? false,
      debouncedWtbInputs.attributes ?? null,
    ],
    enabled: (debouncedWtbInputs.title ?? "").length >= 3,
    staleTime: 30_000,
    queryFn: () =>
      matchWtbFn({
        data: {
          title: debouncedWtbInputs.title ?? "",
          description,
          category_id: categoryId || null,
          price_nok: debouncedWtbInputs.priceNok ?? null,
          is_free: debouncedWtbInputs.isFree ?? false,
          attributes: debouncedWtbInputs.attributes ?? {},
        },
      }),
  });

  const { data: keywordSuggestions, isFetching: keywordsFetching } = useQuery({
    queryKey: ["keyword-suggestions", categoryId, debouncedHintTitle],
    enabled: !!categoryId && debouncedHintTitle.length >= 3,
    staleTime: 120_000,
    queryFn: () =>
      suggestKeywordsForListing({ data: { title: debouncedHintTitle, category_id: categoryId! } }),
  });

  function appendTagToDescription(tag: string) {
    const current = (description ?? "").trimEnd();
    const next = current ? `${current} ${tag}` : tag;
    setValue("description", next, { shouldTouch: false });
  }

  return {
    categorySuggestions,
    categorySuggestionLoading,
    setSuggestionDismissed,
    applyCategorySuggestion,
    similarListings,
    wtbMatch,
    keywordSuggestions,
    keywordsFetching,
    appendTagToDescription,
  };
}
