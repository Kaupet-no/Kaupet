import { useState } from "react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CategoryFilterFields, MoreFiltersToggle } from "@/components/category-filter-fields";
import { splitPrimaryFilters } from "@/lib/category-filters";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

/**
 * Renders a category's attribute filters (primary always shown, secondary
 * tucked behind "Se flere valg"), shared between the /annonser search page's
 * desktop and native filter chips and the category landing pages so the
 * "which fields are searchable" logic can't drift between call sites.
 */
export function AttributeFilterPanel({
  filters,
  values,
  onChange,
}: {
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  onChange: (key: string, value: AttributeFilterValue | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  if (filters.length === 0) return null;
  const { primary, secondary } = splitPrimaryFilters(filters);
  return (
    <div className="space-y-3">
      <CategoryFilterFields filters={primary} values={values} onChange={onChange} />
      {secondary.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <MoreFiltersToggle open={open} count={secondary.length} />
          <CollapsibleContent className="space-y-3 pt-2">
            <CategoryFilterFields filters={secondary} values={values} onChange={onChange} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
