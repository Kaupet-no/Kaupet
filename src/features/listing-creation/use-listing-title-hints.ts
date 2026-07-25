import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { suggestCategoryForTitle } from "@/lib/category-suggestion.functions";
import { suggestKeywordsForListing } from "@/lib/keyword-suggestion.functions";
import { matchWtbListingsForListing } from "@/lib/wtb-listings.functions";

const SIMILAR_STOPWORDS = new Set([
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
 * Everything the new-listing wizard derives from the title as the user
 * types: a debounced category suggestion, "similar listings already up"
 * hints, a WTB (want-to-buy) price match, and keyword suggestions for the
 * description. Pulled out of ny-annonse.tsx, same pattern as
 * useDraftAutosave / useVehicleLookupFlow / useLocationPicker.
 *
 * Note: mine-annonser.$id.rediger.tsx has its own copy of the
 * similar-listings query (including its own SIMILAR_STOPWORDS) — a natural
 * follow-up would be to have it reuse this hook too, but that's out of
 * scope for this extraction.
 */
export function useListingTitleHints(params: {
  title: string;
  description: string | undefined;
  categoryId: string;
  categoryTouchedManually: boolean;
  setSelectedParentId: (id: string) => void;
  setCategoryTouchedManually: (touched: boolean) => void;
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
    setValue,
  } = params;

  const [categorySuggestion, setCategorySuggestion] = useState<CategorySuggestion | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  useEffect(() => {
    if (categoryTouchedManually || suggestionDismissed) return;
    const t = (title ?? "").trim();
    if (t.length < 5) {
      setCategorySuggestion(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await suggestCategoryForTitle({ data: { title: t } });
        setCategorySuggestion(result.suggestion);
      } catch {
        setCategorySuggestion(null);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [title, categoryTouchedManually, suggestionDismissed]);

  function applyCategorySuggestion() {
    if (!categorySuggestion) return;
    setSelectedParentId(categorySuggestion.parent_id ?? categorySuggestion.category_id);
    setValue("category_id", categorySuggestion.category_id, { shouldValidate: true });
    setCategoryTouchedManually(true);
    setCategorySuggestion(null);
  }

  // Debounced title for similar listings query
  const [debouncedTitle, setDebouncedTitle] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTitle(title ?? ""), 800);
    return () => window.clearTimeout(t);
  }, [title]);

  const { data: similarListings } = useQuery({
    queryKey: ["similar-listings", categoryId, debouncedTitle],
    enabled: debouncedTitle.length >= 5 && !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const significantWords = debouncedTitle
        .toLowerCase()
        .replace(/[^a-zæøå0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !SIMILAR_STOPWORDS.has(w));
      if (significantWords.length === 0) return [];
      const { data } = await supabase
        .from("listings")
        .select("id, title, price_nok, is_free, city")
        .eq("category_id", categoryId)
        .eq("status", "active")
        .textSearch("search_vector", significantWords.join(" "), {
          config: "norwegian",
          type: "plain",
        })
        .limit(3);
      return data ?? [];
    },
  });

  // WTB price hint
  const matchWtbFn = useServerFn(matchWtbListingsForListing);
  const { data: wtbMatch } = useQuery({
    queryKey: ["wtb-match", categoryId ?? null, debouncedTitle],
    enabled: debouncedTitle.length >= 3,
    staleTime: 120_000,
    queryFn: () => matchWtbFn({ data: { title: debouncedTitle, category_id: categoryId || null } }),
  });

  // Keyword suggestions from other listings in the same category
  const { data: keywordSuggestions, isFetching: keywordsFetching } = useQuery({
    queryKey: ["keyword-suggestions", categoryId, debouncedTitle],
    enabled: !!categoryId && debouncedTitle.length >= 3,
    staleTime: 120_000,
    queryFn: () =>
      suggestKeywordsForListing({ data: { title: debouncedTitle, category_id: categoryId! } }),
  });

  function appendTagToDescription(tag: string) {
    const current = (description ?? "").trimEnd();
    const next = current ? `${current} ${tag}` : tag;
    setValue("description", next, { shouldTouch: false });
  }

  return {
    categorySuggestion,
    setCategorySuggestion,
    setSuggestionDismissed,
    applyCategorySuggestion,
    similarListings,
    wtbMatch,
    keywordSuggestions,
    keywordsFetching,
    appendTagToDescription,
  };
}
