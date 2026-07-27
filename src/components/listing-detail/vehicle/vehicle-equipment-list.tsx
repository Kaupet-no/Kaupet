import { useMemo } from "react";
import { Check } from "lucide-react";

import { useAllCategoryFilters } from "@/components/attribute-fields";
import { VEHICLE_EQUIPMENT_FILTER_KEYS } from "@/lib/category-filters";

/**
 * Read-only "Utstyr" seksjon for kjøretøy-annonser — viser utstyret selgeren
 * krysset av i `VehicleEquipmentGroup` under annonseopprettelse
 * (`attributes.utstyr_*`, lagret som lister med filter-`value`-strenger).
 * Rendrer kun grupper/valg det faktisk finnes data for. Options/labels
 * kommer fra samme `category_filters`-rader som opprettelsesskjemaet siden
 * utstyrsfiltrene ligger på toppkategorien "Bil og MC" og er identiske for
 * alle leaf-kategorier.
 */
export function VehicleEquipmentList({ attributes }: { attributes: Record<string, unknown> }) {
  const { data: allFilters } = useAllCategoryFilters();

  const groups = useMemo(() => {
    const equipmentFilters = (allFilters ?? []).filter((f) =>
      (VEHICLE_EQUIPMENT_FILTER_KEYS as readonly string[]).includes(f.key),
    );
    return equipmentFilters
      .map((filter) => {
        const selected = attributes[filter.key];
        const selectedValues = Array.isArray(selected) ? (selected as string[]) : [];
        const labels = (filter.options ?? [])
          .filter((o) => selectedValues.includes(o.value))
          .map((o) => o.label_nb);
        return { key: filter.key, label: filter.label_nb, labels };
      })
      .filter((g) => g.labels.length > 0);
  }, [allFilters, attributes]);

  if (groups.length === 0) return null;

  return (
    <div className="@container mt-3 space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          {/* Uppercase/tracking-wide subgroup label under a Fraunces H2 is an
              intentional two-tier pattern for this section, not a mismatch. */}
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-sm @sm:grid-cols-2 @lg:grid-cols-3">
            {group.labels.map((label) => (
              <p key={label} className="flex items-center gap-1.5">
                <Check className="size-4 shrink-0 text-primary" />
                {label}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
