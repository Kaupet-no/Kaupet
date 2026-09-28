import { useMemo } from "react";

import type { CategoryFilter, CategoryNode } from "@/lib/category-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { suggestVehicleCategoryForTitle } from "@/lib/search-category-match";
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";

/**
 * Fanger opp kjøretøytitler `suggest_category_for_title` (RPC-en bak
 * useTitleCategorySuggestion) bommer på: den matcher kun mot historiske
 * annonser og kategorinavn, så en tittel med bare merke/modell/karosseri
 * ("Volvo V70 stasjonsvogn") gir ingen treff siden ingen kategori heter
 * "Volvo". Gjenbruker søkets eksisterende merke-/attributtmatching
 * (search-category-match.ts) som allerede løser akkurat dette for
 * søkefeltet på /annonser. Debounces på samme 400 ms som RPC-en for å unngå
 * å flimre et annet forslag mens brukeren fortsatt skriver.
 *
 * Resultatet sendes som `clientCategoryHint` til useTitleCategorySuggestion.
 */
export function useVehicleTitleCategoryHint<
  T extends { id: string; slug: string; name_nb: string; parent_id: string | null },
>(params: {
  title: string;
  allFilters: CategoryFilter[] | undefined;
  categories: T[] | undefined;
  categoriesById: Map<string, CategoryNode & { name_nb: string }>;
  bilOgMcCategoryId: string | null;
}) {
  const { title, allFilters, categories, categoriesById, bilOgMcCategoryId } = params;
  const debouncedTitle = useDebouncedValue(title.trim(), 400);
  const { data: vehicleBrands } = useAllVehicleBrands();
  // Samme react-query-cache-oppføring som useVehicleLookupFlow henter — ingen
  // ekstra nettverkskall der begge brukes.
  const { data: vehicleModels } = useAllVehicleModels();
  return useMemo(
    () =>
      debouncedTitle.length >= 5
        ? suggestVehicleCategoryForTitle({
            title: debouncedTitle,
            vehicleBrands: vehicleBrands ?? [],
            vehicleModels: vehicleModels ?? [],
            allFilters: allFilters ?? [],
            categories: categories ?? [],
            categoriesById,
            bilOgMcCategoryId,
          })
        : null,
    [
      debouncedTitle,
      vehicleBrands,
      vehicleModels,
      allFilters,
      categories,
      categoriesById,
      bilOgMcCategoryId,
    ],
  );
}
