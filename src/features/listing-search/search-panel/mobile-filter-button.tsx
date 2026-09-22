import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackProductEvent } from "@/lib/product-analytics";
import { useSearchPanel } from "./search-panel-context";

/**
 * Filterinngangen på mobilweb — én komponent delt av `/annonser` og
 * kategorilandingssidene, slik at de to flatene ikke kan drifte fra hverandre
 * slik de gjorde da hver side bestemte sitt eget mobile filter-UI.
 *
 * Desktop rendrer den ikke: der står filtrene permanent i sidekolonnen
 * (`SearchFilterSidebar`). Native har sin egen inngang i `SearchSummaryPill`.
 * Kallstedet avgjør — komponenten gjør ingen formatfaktor-sjekk selv.
 */
export function MobileFilterButton({ activeFilterCount }: { activeFilterCount: number }) {
  const { openPanel } = useSearchPanel();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        trackProductEvent("search_filter_opened", {
          section: "categories",
          source: "filter_button",
          filterCount: activeFilterCount,
        });
        openPanel("categories");
      }}
      aria-label={
        activeFilterCount > 0 ? `Filtrer, ${activeFilterCount} aktive` : "Filtrer annonser"
      }
    >
      <SlidersHorizontal className="size-4" />
      Filtrer{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
    </Button>
  );
}
