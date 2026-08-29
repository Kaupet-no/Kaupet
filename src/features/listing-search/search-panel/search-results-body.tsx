import type { ReactNode } from "react";
import { SearchFilterSidebar } from "@/features/listing-search/search-panel/search-filter-sidebar";
import type { SearchPanelResultsContext } from "@/features/listing-search/search-panel/search-panel";
import type { Category } from "@/lib/categories";

/**
 * Desktop-web layout shared by /annonser and the category landing pages:
 * filters permanently to the left of the results instead of in a dialog
 * above them (see SearchFilterSidebar). Native and mobile web render
 * `children` alone, full-width — each page decides its own mobile filter UI.
 */
export function SearchResultsBody({
  isNative,
  isDesktop,
  searchPanelResults,
  categories,
  onSaveSearch,
  children,
}: {
  isNative: boolean;
  isDesktop: boolean;
  searchPanelResults: SearchPanelResultsContext;
  categories: Category[];
  onSaveSearch?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={
        isNative
          ? undefined
          : "mt-4 lg:grid lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start lg:gap-8"
      }
    >
      {isDesktop && !isNative && (
        <SearchFilterSidebar
          results={searchPanelResults}
          categories={categories}
          onSaveSearch={onSaveSearch}
        />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
