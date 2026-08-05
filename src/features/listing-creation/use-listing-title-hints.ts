import { useEffect, useState } from "react";
import { suggestCategoryForTitle } from "@/lib/category-suggestion.functions";
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
