import { useState } from "react";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";

import { FilterChip } from "@/components/filter-chip";
import { NativeChoiceSheet } from "@/components/ui/native-choice-sheet";
import { conditionOptionsFor } from "@/lib/advanced-search-value";
import { SORT_OPTIONS, type SortValue } from "@/lib/categories";
import {
  searchFilterDependencyMet,
  splitPrimaryFilters,
  type AttributeFilterValue,
  type CategoryFilter,
} from "@/lib/category-filters";
import { getAttributeChipState, getSortChipState } from "@/lib/filter-chip-labels";
import { rankSearchFilters } from "@/features/listing-search/rank-search-filters";
import { hapticImpact } from "@/lib/haptics";
import { useSearchPanel } from "./search-panel-context";

/** Så mange kategorifiltre får egen brikke; resten nås via «Filtre». */
const CATEGORY_CHIP_LIMIT = 3;

type Props = {
  min?: number;
  max?: number;
  includeFree: boolean;
  conditions: string[];
  categorySlugs: string[];
  location: { lat?: number | null; label?: string; radius?: number };
  sort: SortValue;
  onSortChange: (sort: SortValue) => void;
  attrFilters: CategoryFilter[];
  attrValues: Record<string, AttributeFilterValue>;
  queryText: string;
  /** Antall aktive filtre, vist på «Filtre»-brikken. */
  filterCount: number;
};

const kr = (n: number) => `${n.toLocaleString("nb-NO")} kr`;

function priceLabel(min: number | undefined, max: number | undefined, includeFree: boolean) {
  if (min != null && max != null) return `${min.toLocaleString("nb-NO")}–${kr(max)}`;
  if (min != null) return `Fra ${kr(min)}`;
  if (max != null) return `Maks ${kr(max)}`;
  return includeFree ? "Pris" : "Uten gratis";
}

/**
 * Brikkeraden under søkefeltet på native resultatflater. Hver brikke åpner
 * søkepanelet rett på sitt filter; en aktiv brikke er fylt og viser verdien,
 * så søkets tilstand synes uten å åpne noe. Kategorifiltrene rangeres etter
 * aktiv verdi, søketekst og treff — plassen er knapp her, i motsetning til
 * filterlisten, som bruker fast rekkefølge.
 */
export function SearchFilterChipRow({
  min,
  max,
  includeFree,
  conditions,
  categorySlugs,
  location,
  sort,
  onSortChange,
  attrFilters,
  attrValues,
  queryText,
  filterCount,
}: Props) {
  const { openPanel } = useSearchPanel();
  const [sortOpen, setSortOpen] = useState(false);
  const open = (...args: Parameters<typeof openPanel>) => {
    void hapticImpact("light");
    openPanel(...args);
  };

  const conditionLabels = conditionOptionsFor(categorySlugs);
  const conditionLabel =
    conditions.length === 0
      ? "Tilstand"
      : conditions.length === 1
        ? (conditionLabels.find((option) => option.value === conditions[0])?.label ?? "Tilstand")
        : `Tilstand (${conditions.length})`;
  const hasLocation = location.lat != null;
  const categoryChips = rankSearchFilters({
    filters: splitPrimaryFilters(
      attrFilters.filter((filter) => searchFilterDependencyMet(filter, attrValues, attrFilters)),
    ).primary,
    activeValues: attrValues,
    queryText,
    // Ikke fasett-tellinger: de finnes ikke for Merke/Modell, og ville skjøvet
    // de viktigste kjøretøyfiltrene ut av raden. Admin-rekkefølgen er
    // utgangspunktet, aktive filtre og søketekst løfter.
    limit: CATEGORY_CHIP_LIMIT,
  });
  const sortState = getSortChipState(sort);

  return (
    <>
      <div
        role="group"
        aria-label="Filtre"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <FilterChip
          label="Filtre"
          active={filterCount > 0}
          icon={<SlidersHorizontal className="size-3.5" aria-hidden />}
          badge={filterCount}
          hideChevron
          aria-label={filterCount > 0 ? `Alle filtre, ${filterCount} aktive` : "Alle filtre"}
          onClick={() => open("categories")}
        />
        <FilterChip
          label={sortState.label}
          active={sortState.active}
          icon={<ArrowUpDown className="size-3.5" aria-hidden />}
          aria-label={`Sortering: ${sortState.label}`}
          onClick={() => setSortOpen(true)}
        />
        <FilterChip
          label={priceLabel(min, max, includeFree)}
          active={min != null || max != null || !includeFree}
          onClick={() => open("price")}
        />
        <FilterChip
          label={hasLocation ? `${location.label || "Valgt sted"} · ${location.radius} km` : "Sted"}
          active={hasLocation}
          onClick={() => open("location")}
        />
        <FilterChip
          label={conditionLabel}
          active={conditions.length > 0}
          onClick={() => open("conditions")}
        />
        {categoryChips.map((filter) => {
          const state = getAttributeChipState(filter, attrValues[filter.key]);
          return (
            <FilterChip
              key={filter.id}
              label={state.label}
              active={state.active}
              onClick={() => open("attributes", undefined, filter.key)}
            />
          );
        })}
      </div>
      <NativeChoiceSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="Sorter annonser"
        options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={[sort]}
        onChange={(next) => {
          if (next[0]) onSortChange(next[0] as SortValue);
          setSortOpen(false);
        }}
      />
    </>
  );
}
