import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import { RangeFilterField } from "@/components/range-filter-field";
import { CONDITIONS } from "@/components/advanced-search-value";
import { PRICE_BOUNDS } from "@/lib/filter-range-bounds";
import { splitPrimaryFilters } from "@/lib/category-filters";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-border py-4 first:pt-0"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
        {title}
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

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
  /** Facet result counts per filter key/value, e.g. `{ fuel_type: { diesel: 98 } }`. */
  counts?: Record<string, Record<string, number>>;
};

/**
 * Persistent desktop filter panel for /annonser (forslag 2): every filter
 * lives in its own collapsible section instead of a flat popover-chip row,
 * so Pris/Tilstand/Spesifikasjoner read as distinct groups. `is_primary`
 * (already used to decide chip visibility elsewhere) doubles as which
 * category-attribute sections start open — no new grouping schema needed.
 */
export function FilterSidebar({
  filters,
  values,
  onChange,
  min,
  max,
  includeFree,
  onPriceChange,
  conditions,
  onConditionsChange,
  hideCondition,
  counts,
}: Props) {
  const { primary, secondary } = splitPrimaryFilters(filters);

  return (
    <aside className="space-y-0">
      <Section title="Pris" defaultOpen>
        <RangeFilterField
          label="Pris"
          bounds={PRICE_BOUNDS}
          value={{ min, max }}
          onChange={(next) => onPriceChange(next.min, next.max, includeFree ?? true)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={includeFree ?? true}
            onCheckedChange={(c) => onPriceChange(min, max, c === true)}
          />
          Inkluder gratis-annonser
        </label>
      </Section>

      {!hideCondition && (
        <Section title="Tilstand" defaultOpen>
          <div className="space-y-1.5">
            {CONDITIONS.map((c) => (
              <label key={c.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={(conditions ?? []).includes(c.value)}
                  onCheckedChange={(checked) =>
                    onConditionsChange(
                      checked
                        ? [...(conditions ?? []), c.value]
                        : (conditions ?? []).filter((v) => v !== c.value),
                    )
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </Section>
      )}

      {primary.length > 0 && (
        <Section title="Spesifikasjoner" defaultOpen>
          <CategoryFilterFields
            filters={primary}
            brandLookupFilters={filters}
            values={values}
            onChange={onChange}
            counts={counts}
          />
        </Section>
      )}

      {secondary.length > 0 && (
        <Section title="Flere valg" defaultOpen={false}>
          <CategoryFilterFields
            filters={secondary}
            brandLookupFilters={filters}
            values={values}
            onChange={onChange}
            counts={counts}
          />
        </Section>
      )}

      {filters.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">
          Velg en kategori for å se flere filtermuligheter.
        </p>
      )}
    </aside>
  );
}
