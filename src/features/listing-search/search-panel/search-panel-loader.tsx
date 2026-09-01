import { useMemo } from "react";

import { useAllCategoryFilters } from "@/components/attribute-fields";
import type { LocationValue } from "@/components/location-filter";
import { useCategories, visibleCategories } from "@/hooks/use-categories";
import {
  SearchPanel,
  type SearchPanelResultsContext,
  type SearchPanelSection,
} from "./search-panel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection: SearchPanelSection;
  results?: SearchPanelResultsContext;
  savedLocation: LocationValue;
  onSavedLocationChange: (location: LocationValue) => void;
};

export function SearchPanelLoader(props: Props) {
  const { data: allCategoriesRaw } = useCategories();
  const categories = useMemo(
    () => visibleCategories(allCategoriesRaw ?? [], false),
    [allCategoriesRaw],
  );
  const { data: allFilters } = useAllCategoryFilters();

  return <SearchPanel {...props} categories={categories} allFilters={allFilters ?? []} />;
}
