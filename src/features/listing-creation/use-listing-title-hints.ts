import { useEffect, useState } from "react";
import { prefetchCategorySuggestion } from "@/lib/category-suggestion.functions";
import { useTitleBasedListingHints } from "@/features/listing-creation/use-title-based-listing-hints";
import type { AttributeMap } from "@/components/attribute-fields";

type CategorySuggestion = {
  category_id: string;
  parent_id: string | null;
  name_nb: string;
  parent_name_nb: string | null;
};

/**
 * Everything the new-listing wizard derives from the title as the user
 * types: a debounced category suggestion, plus the shared "similar listings
 * already up" hints, WTB (want-to-buy) price match, and keyword suggestions
 * from useTitleBasedListingHints. Pulled out of ny-annonse.tsx, same pattern
 * as useDraftAutosave / useVehicleLookupFlow / useLocationPicker.
 *
 * Note: mine-annonser.$id.rediger.tsx uses useEditListingHints instead,
 * which shares the same title-based-hints core but skips the category
 * suggestion (editing an already-published listing shouldn't suggest a
 * different category off a title tweak) and excludes the listing itself
 * from its own similar-listings search.
 */
export function useListingTitleHints(params: {
  title: string;
  description: string | undefined;
  categoryId: string;
  categoryTouchedManually: boolean;
  setSelectedParentId: (id: string) => void;
  setCategoryTouchedManually: (touched: boolean) => void;
  priceNok?: number | undefined;
  isFree?: boolean;
  attributes?: AttributeMap;
  /** When true, and a title of at least 5 characters is already present on
   * first mount (e.g. prefilled from the intent+title landing screen), fires
   * the category suggestion fetch immediately instead of waiting the normal
   * 400ms typing debounce — the suggestion is then often ready before the
   * user reaches the category-confirm step. */
  immediate?: boolean;
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
    priceNok,
    isFree,
    attributes,
    immediate,
    setValue,
  } = params;

  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([]);
  const [categorySuggestionLoading, setCategorySuggestionLoading] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [firedImmediately, setFiredImmediately] = useState(false);

  useEffect(() => {
    if (categoryTouchedManually || suggestionDismissed) return;
    const t = (title ?? "").trim();
    if (t.length < 5) {
      setCategorySuggestions([]);
      return;
    }
    const fireImmediately = immediate && !firedImmediately;
    if (fireImmediately) setFiredImmediately(true);
    const delay = fireImmediately ? 0 : 400;
    setCategorySuggestionLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await prefetchCategorySuggestion(t);
        setCategorySuggestions(result.suggestions);
      } catch {
        setCategorySuggestions([]);
      } finally {
        setCategorySuggestionLoading(false);
      }
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, categoryTouchedManually, suggestionDismissed]);

  /** `categoryId` must be one of `categorySuggestions`' ids — lets the caller
   * (category-confirm, or category-select's "Bruk forslag" chip) apply
   * whichever of the (up to 2) candidates the user picked. */
  function applyCategorySuggestion(categoryId: string) {
    const suggestion = categorySuggestions.find((s) => s.category_id === categoryId);
    if (!suggestion) return;
    setSelectedParentId(suggestion.parent_id ?? suggestion.category_id);
    setValue("category_id", suggestion.category_id, { shouldValidate: true });
    setCategoryTouchedManually(true);
    setCategorySuggestions([]);
  }

  const {
    similarListings,
    wtbMatch,
    keywordSuggestions,
    keywordsFetching,
    appendTagToDescription,
  } = useTitleBasedListingHints({
    title,
    description,
    categoryId,
    priceNok,
    isFree,
    attributes,
    setValue,
  });

  return {
    categorySuggestions,
    categorySuggestionLoading,
    setCategorySuggestions,
    setSuggestionDismissed,
    applyCategorySuggestion,
    similarListings,
    wtbMatch,
    keywordSuggestions,
    keywordsFetching,
    appendTagToDescription,
  };
}
