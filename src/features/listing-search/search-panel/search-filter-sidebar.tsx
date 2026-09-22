import { RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  defaultAdvancedSearchValue,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import type { AttributeFilterValue } from "@/lib/category-filters";
import { priceBoundsForMax } from "@/lib/filter-range-bounds";
import { trackProductEvent } from "@/lib/product-analytics";
import { SearchFilterSections } from "./filter-sections";
import type { SearchPanelResultsContext } from "./search-panel";

type Props = {
  results: SearchPanelResultsContext;
  categories: Category[];
  /** «Lagre søk» — utelates for utloggede brukere. */
  onSaveSearch?: () => void;
  /** "sidebar" er desktops sticky sidekolonne. "inline" er samme innhold uten
   * kolonne-chrome, til bruk inne i mobilwebens filterdialog — se
   * `SearchPanel`, som gir den et utkast i stedet for anvendt state. */
  variant?: "sidebar" | "inline";
  className?: string;
};

/**
 * Hele filtersettet i nettleseren — permanent sidekolonne på desktop
 * (`variant="sidebar"`), og nøyaktig det samme innholdet inne i mobilwebens
 * filterdialog (`variant="inline"`). Én komponent, så de to bredene ikke kan
 * drifte fra hverandre.
 *
 * Komponenten eier ingen tilstand: `results.applied`/`onApply` er anvendt
 * søk i sidekolonnen (hvert valg gjelder umiddelbart) og dialogens utkast i
 * `inline` (der «Vis N annonser» committer). Seksjonene er
 * `SearchFilterSections` i `layout="expanded"` i begge.
 */
export function SearchFilterSidebar({
  results,
  categories,
  onSaveSearch,
  variant = "sidebar",
  className,
}: Props) {
  const { applied, onApply } = results;

  const setValue = (next: React.SetStateAction<AdvancedSearchValue>) => {
    const value = typeof next === "function" ? next(applied.value) : next;
    onApply({ ...applied, value });
  };

  const onAttributeChange = (key: string, value: AttributeFilterValue | undefined) => {
    const attributes = { ...applied.attributes };
    if (value === undefined) delete attributes[key];
    else attributes[key] = value;
    onApply({ ...applied, attributes });
  };
  const priceBounds = priceBoundsForMax(results.availablePriceMax, {
    min: applied.value.min ?? undefined,
    max: applied.value.max ?? undefined,
  });

  const activeCount =
    Object.keys(applied.attributes).length +
    applied.value.categories.length +
    applied.value.conditions.length +
    (applied.value.min != null || applied.value.max != null ? 1 : 0) +
    (applied.value.location.lat != null ? 1 : 0) +
    applied.value.extraGroups.length;

  const inline = variant === "inline";
  const Root = inline ? "div" : "aside";

  return (
    <Root
      aria-label={inline ? undefined : "Filtrer annonser"}
      data-testid={inline ? undefined : "search-filter-sidebar"}
      className={cn(
        inline
          ? "min-h-0 flex-1 overflow-y-auto"
          : "sticky top-20 hidden shrink-0 rounded-xl border border-border bg-card lg:block",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold">
          Filtre{activeCount > 0 ? ` · ${activeCount}` : ""}
        </h2>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground"
            onClick={() => {
              trackProductEvent("search_filter_applied", {
                section: "categories",
                filterCount: 0,
                resultCount: null,
              });
              onApply({ value: defaultAdvancedSearchValue(), attributes: {} });
            }}
          >
            <RotateCcw className="size-3.5" />
            Nullstill
          </Button>
        )}
      </div>

      <div className="px-4 pb-4">
        <SearchFilterSections
          layout="expanded"
          value={applied.value}
          setValue={setValue}
          categories={categories}
          section="categories"
          queryText={applied.value.terms.join(" ")}
          attributeFilters={results.attributeFilters}
          attributeValues={applied.attributes}
          onAttributeChange={onAttributeChange}
          attributeCounts={results.attributeCounts}
          priceBounds={priceBounds}
          includePrimary
          hideCategory={results.categoryLocked}
        />
        {onSaveSearch && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full gap-1.5"
            onClick={onSaveSearch}
          >
            <Save className="size-4" /> Lagre søk
          </Button>
        )}
      </div>
    </Root>
  );
}
