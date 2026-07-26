import { useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { useAllCategoryFilters, type AttributeMap } from "@/components/attribute-fields";
import {
  effectiveFiltersForCategory,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type CategoryFilter,
} from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";

export { VEHICLE_EQUIPMENT_FILTER_KEYS };

/** Én utstyrsgruppe (f.eks. "Teknisk"): liten uppercase-overskrift + et
 * rutenett med avkrysningsbokser — tettere og ryddigere enn en flat
 * flex-wrap-liste når hver gruppe har 5–27 alternativer. */
function EquipmentGroup({
  filter,
  value,
  onChange,
}: {
  filter: CategoryFilter;
  value: AttributeMap;
  onChange: (next: AttributeMap) => void;
}) {
  const options = filter.options ?? [];
  const selected = Array.isArray(value[filter.key]) ? (value[filter.key] as string[]) : [];

  const toggle = (optionValue: string) => {
    const next = selected.includes(optionValue)
      ? selected.filter((v) => v !== optionValue)
      : [...selected, optionValue];
    const nextValue = { ...value };
    if (next.length > 0) nextValue[filter.key] = next;
    else delete nextValue[filter.key];
    onChange(nextValue);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {filter.label_nb}
      </p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
            />
            {o.label_nb}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Utstyrsliste for Bil og MC: seks avkrysningsgrupper (Teknisk,
 * Førerstøttesystemer, Dekk, Lys, Interiør, Annet), hver drevet av sin egen
 * `multiselect`-category_filter (alfabetisk sortert options-liste satt opp i
 * migrasjonen). Valgfritt — ingen `fieldsToValidate`/`validateExtra` i
 * registry.ts, siden manglende utstyrsinformasjon ikke skal blokkere
 * publisering.
 *
 * Rendres på samme side som description-keywords, rett under
 * Beskrivelse-feltet (se VEHICLE_FORCE_BREAK_BEFORE_KEYS i ny-annonse.tsx og
 * feltrekkefølgen i bil-og-mc-migrasjonen) — egen visuell seksjon
 * ("Utstyr"-kort) i stedet for et helt eget steg, siden det uansett hører
 * naturlig sammen med å beskrive kjøretøyet.
 */
export function VehicleEquipmentGroup({
  categoryId,
  categories,
  attributes,
  onAttributesChange,
}: WizardSharedProps) {
  const { data: allFilters } = useAllCategoryFilters();

  const categoriesById = useMemo(() => {
    const m = new Map<string, { id: string; parent_id: string | null }>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  const equipmentKeySet = useMemo(() => new Set<string>(VEHICLE_EQUIPMENT_FILTER_KEYS), []);

  const filters = useMemo(
    () =>
      effectiveFiltersForCategory(categoryId, allFilters ?? [], categoriesById).filter((f) =>
        equipmentKeySet.has(f.key),
      ),
    [categoryId, allFilters, categoriesById, equipmentKeySet],
  );

  if (!categoryId || filters.length === 0) return null;

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Utstyr</p>
      {filters.map((f) => (
        <EquipmentGroup key={f.id} filter={f} value={attributes} onChange={onAttributesChange} />
      ))}
    </div>
  );
}
