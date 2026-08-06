import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FilterSidebar } from "@/components/filter-sidebar";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

type Props = {
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  onChange: (key: string, value: AttributeFilterValue | undefined) => void;
  min?: number;
  max?: number;
  includeFree?: boolean;
  onPriceChange: (min: number | undefined, max: number | undefined, includeFree: boolean) => void;
  conditions?: string[];
  onConditionsChange: (c: string[]) => void;
  hideCondition?: boolean;
  counts?: Record<string, Record<string, number>>;
  /** Shown on the trigger button and the sheet's dismiss button, same as the
   * old AttributeFilterChips "Se flere filter" badge/footer. */
  activeCount: number;
  resultCount?: number;
};

/**
 * Mobile-web equivalent of FilterSidebar (forslag 2): the same sections in a
 * bottom sheet instead of a persistent column, triggered by one "Filter"
 * button. Reuses FilterSidebar's body as-is — the sheet only supplies the
 * trigger/chrome, so the two surfaces can never drift on which sections or
 * controls a filter renders as.
 */
export function FilterSheet({ activeCount, resultCount, ...sidebarProps }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative gap-1.5 rounded-full"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="size-3.5" />
        Filter
        {activeCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </Button>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Filter</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <FilterSidebar {...sidebarProps} />
        </div>
        <Button type="button" className="mt-4 w-full" onClick={() => setOpen(false)}>
          {resultCount == null
            ? "Vis annonser"
            : `Vis ${resultCount} annonse${resultCount === 1 ? "" : "r"}`}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
