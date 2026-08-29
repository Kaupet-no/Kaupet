import { RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  defaultAdvancedSearchValue,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import type { AttributeFilterValue } from "@/lib/category-filters";
import { trackProductEvent } from "@/lib/product-analytics";
import { SearchFilterSections } from "./filter-sections";
import type { SearchPanelResultsContext } from "./search-panel";

type Props = {
  results: SearchPanelResultsContext;
  categories: Category[];
  /** «Lagre søk» — utelates for utloggede brukere. */
  onSaveSearch?: () => void;
};

/**
 * Filtrene som permanent sidekolonne på desktop, der skuffen/dialogen er feil
 * form: nettleserbrukeren skal se treffene endre seg mens hun filtrerer, ikke
 * lukke en modal for å oppdage resultatet.
 *
 * Ingen eget utkast og ingen «Vis N annonser»-knapp — hvert valg gjelder
 * umiddelbart mot samme `onApply` som panelet bruker. Seksjonene er de samme
 * (`SearchFilterSections`), bare i `layout="expanded"`.
 */
export function SearchFilterSidebar({ results, categories, onSaveSearch }: Props) {
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

  const activeCount =
    Object.keys(applied.attributes).length +
    applied.value.categories.length +
    applied.value.conditions.length +
    (applied.value.min != null || applied.value.max != null ? 1 : 0) +
    (applied.value.location.lat != null ? 1 : 0) +
    applied.value.extraGroups.length;

  return (
    <aside
      aria-label="Filtrer annonser"
      data-testid="search-filter-sidebar"
      className="sticky top-20 hidden shrink-0 rounded-xl border border-border bg-card lg:block"
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
          includePrimary
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
    </aside>
  );
}
