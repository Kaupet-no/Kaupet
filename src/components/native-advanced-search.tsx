import { useEffect, useState } from "react";
import { ArrowLeft, RotateCcw, Save, Search as SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import type { AdvancedSearchValue } from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import type { LocationValue } from "@/components/location-filter";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { useAuth } from "@/hooks/use-auth";
import { useAdvancedSearchValue } from "@/hooks/use-advanced-search-value";
import {
  buildAdvancedSearchCriteria,
  mergeAdvancedSearchGroups,
  resetAdvancedSearchValue,
} from "@/lib/advanced-search-actions";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { FullscreenOverlay, FullscreenOverlayContent } from "@/components/ui/fullscreen-overlay";
import {
  SearchFilterSections,
  type SearchFilterSection,
} from "@/features/listing-search/search-panel/filter-sections";

export type NativeAdvancedSearchSection = SearchFilterSection;

type Props = {
  open: boolean;
  onClose: () => void;
  initial: AdvancedSearchValue;
  categories: Category[];
  onApply: (v: AdvancedSearchValue) => void;
  location?: LocationValue;
  onLocationChange?: (v: LocationValue) => void;
  attributeFilters?: CategoryFilter[];
  attributeValues?: Record<string, AttributeFilterValue>;
  onAttributeChange?: (key: string, value: AttributeFilterValue | undefined) => void;
  attributeCounts?: Record<string, Record<string, number>>;
  initialSection?: NativeAdvancedSearchSection;
  /** Label for the primary footer action (default "Bruk søk"). */
  applyLabel?: string;
  /** Hide the internal "Lagre" action — used when this overlay is already
   * editing the filters of an existing saved search, where "save as new"
   * doesn't make sense. */
  hideSaveAction?: boolean;
};

/**
 * Fullskjerm filterredigering. Etter fase 9 er dette **kun** redigering av et
 * lagret søk (`mine-sok.tsx`) — resultatflatene bruker `SearchPanel`, som
 * rendrer nøyaktig de samme seksjonene (`SearchFilterSections`) i en dratt
 * skuff med detents i stedet.
 */
export function NativeAdvancedSearch({
  open,
  onClose,
  initial,
  categories,
  onApply,
  location,
  onLocationChange,
  attributeFilters,
  attributeValues,
  onAttributeChange,
  attributeCounts,
  initialSection = "search",
  applyLabel = "Bruk søk",
  hideSaveAction = false,
}: Props) {
  const { user } = useAuth();
  const [v, setV] = useAdvancedSearchValue(open, initial);
  const [saveOpen, setSaveOpen] = useState(false);
  const [section, setSection] = useState<NativeAdvancedSearchSection>(initialSection);

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);

  const handleApply = () => {
    void hapticNotification("success");
    onApply(mergeAdvancedSearchGroups(v));
    onClose();
  };

  const { criteria, defaultName } = buildAdvancedSearchCriteria(v);

  return (
    <FullscreenOverlay open={open} onOpenChange={(next) => !next && onClose()}>
      <FullscreenOverlayContent
        title="Filter"
        className="animate-in slide-in-from-bottom-4 duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-4"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={() => {
              void hapticImpact("light");
              onClose();
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Tilbake"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h2 className="font-display text-lg tracking-tight">Filter</h2>
          <button
            type="button"
            onClick={() => {
              void hapticImpact("light");
              setV(resetAdvancedSearchValue(v));
            }}
            className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Nullstill
          </button>
        </div>

        <SearchFilterSections
          value={v}
          setValue={setV}
          categories={categories}
          section={section}
          onSectionChange={setSection}
          location={location}
          onLocationChange={onLocationChange}
          attributeFilters={attributeFilters}
          attributeValues={attributeValues}
          onAttributeChange={onAttributeChange}
          attributeCounts={attributeCounts}
        />

        <div className="flex gap-2 border-t border-border px-4 py-3">
          {user && !hideSaveAction && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setSaveOpen(true)}
              className="gap-2"
            >
              <Save className="size-4" /> Lagre
            </Button>
          )}
          <Button type="button" size="lg" onClick={handleApply} className="flex-1 gap-2">
            <SearchIcon className="size-4" /> {applyLabel}
          </Button>
        </div>

        {!hideSaveAction && (
          <SaveSearchDialog
            open={saveOpen}
            onOpenChange={setSaveOpen}
            defaultName={defaultName}
            criteria={criteria}
            onSaved={() => setSaveOpen(false)}
          />
        )}
      </FullscreenOverlayContent>
    </FullscreenOverlay>
  );
}
