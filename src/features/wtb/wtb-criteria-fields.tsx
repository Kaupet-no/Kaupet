import { useMemo, useState } from "react";
import { ChevronRight, Info } from "lucide-react";

import { useAllCategoryFilters } from "@/components/attribute-fields";
import { RangeFilterField } from "@/components/range-filter-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSheet } from "@/components/ui/native-sheet";
import { EuControlDateField } from "@/features/listing-creation/field-groups/vehicle-confirm/eu-control-date-field";
import {
  VehicleBrandField,
  VehicleModelWithClassField,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import {
  effectiveFiltersForCategory,
  filterDependencyMet,
  type AttributeValue,
  type CategoryFilter,
  type CategoryNode,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
import { useAttributeRangeBounds, dynamicBoundsForFilter } from "./use-attribute-bounds";
import {
  EU_CONTROL_KEY,
  isWtbDateMinValue,
  isWtbRangeValue,
  type WtbAttributeMap,
  type WtbAttributeValue,
} from "./wtb-criteria-types";
import { criterionSummary, orderWtbCriteria } from "./wtb-criteria-presentation";

/**
 * Renders the search-criteria form for an Ønskes kjøpt listing: one row per
 * effective category filter. On native, filters are overview rows opening a
 * focused detail surface; web keeps efficient inline controls. Empty means
 * «Ingen begrensning» on both platforms. Unlike the sell flow's
 * AttributeFields, nothing here is required, selects allow several values,
 * and numerics are from–to sliders scaled by what exists on Kaupet.
 */
export function WtbCriteriaFields({
  categoryId,
  categories,
  value,
  onChange,
  checkedKeys,
  onCheckedKeysChange,
  native = false,
}: {
  categoryId: string | null;
  categories: CategoryNode[];
  value: WtbAttributeMap;
  onChange: (next: WtbAttributeMap) => void;
  /** Keys the user has activated; a key with a value is always checked. */
  checkedKeys: readonly string[];
  onCheckedKeysChange: (next: string[]) => void;
  native?: boolean;
  /** Legacy edit-flow prop; empty criteria no longer produce an error. */
  showErrors?: boolean;
}) {
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(null);
  const { data: allFilters } = useAllCategoryFilters();
  const { data: dynamicBounds } = useAttributeRangeBounds(categoryId);

  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const filters = useMemo(
    () =>
      effectiveFiltersForCategory(categoryId, allFilters ?? [], categoriesById).filter((f) =>
        filterDependencyMet(f, value as Record<string, AttributeValue>),
      ),
    [categoryId, allFilters, categoriesById, value],
  );

  if (!categoryId || filters.length === 0) return null;

  const setValue = (key: string, v: WtbAttributeValue | undefined) => {
    const empty =
      v === undefined ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (isWtbRangeValue(v) && v.min == null && v.max == null);
    const next = { ...value };
    if (empty) delete next[key];
    else next[key] = v;
    onChange(next);
    onCheckedKeysChange(
      empty
        ? checkedKeys.filter((checkedKey) => checkedKey !== key)
        : [...new Set([...checkedKeys, key])],
    );
  };

  const clearValue = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
    onCheckedKeysChange(checkedKeys.filter((checkedKey) => checkedKey !== key));
  };

  const brandFilter = filters.find((f) => f.type === "brand_select");
  const brandName =
    brandFilter && typeof value[brandFilter.key] === "string"
      ? (value[brandFilter.key] as string)
      : undefined;

  const sortedFilters = orderWtbCriteria(filters, value);
  const activeFilter = filters.find((filter) => filter.key === activeFilterKey) ?? null;
  const field = (filter: CategoryFilter) => (
    <WtbCriterionField
      filter={filter}
      value={value[filter.key]}
      onChange={(next) => setValue(filter.key, next)}
      brandGroup={(brandFilter?.unit ?? "bil") as VehicleBrandGroup}
      brandName={brandName}
      bounds={dynamicBounds}
    />
  );

  if (native) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Velg bare begrensningene som er viktige. Resten kan være åpne.
        </p>
        {sortedFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveFilterKey(filter.key)}
            className="native-touch-target flex min-h-14 w-full items-center gap-3 rounded-xl bg-muted px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium">{criterionLabel(filter)}</span>
              <span className="block text-sm text-muted-foreground">
                {criterionSummary(filter, value[filter.key])}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        ))}
        <NativeSheet
          open={activeFilter !== null}
          onOpenChange={(open) => !open && setActiveFilterKey(null)}
          title={activeFilter ? criterionLabel(activeFilter) : "Søkekriterium"}
          titleVisible
          expandable
          className="overflow-y-auto"
        >
          {activeFilter && (
            <div className="mt-4 space-y-5">
              {field(activeFilter)}
              <div className="flex gap-2">
                {activeFilter.key in value && (
                  <Button
                    type="button"
                    variant="outline"
                    className="native-touch-target flex-1"
                    onClick={() => clearValue(activeFilter.key)}
                  >
                    Ingen begrensning
                  </Button>
                )}
                <Button
                  type="button"
                  className="native-touch-target flex-1"
                  onClick={() => setActiveFilterKey(null)}
                >
                  Ferdig
                </Button>
              </div>
            </div>
          )}
        </NativeSheet>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Fyll ut bare begrensningene som er viktige. Tomme felt betyr ingen begrensning.
      </p>
      {sortedFilters.map((filter) => (
        <section key={filter.id} className="space-y-2">
          <Label>{criterionLabel(filter)}</Label>
          {field(filter)}
        </section>
      ))}
    </div>
  );
}

function criterionLabel(filter: CategoryFilter) {
  if (filter.key === EU_CONTROL_KEY) return "Neste EU-kontroll (tidligst)";
  return filter.unit && filter.type !== "brand_select"
    ? `${filter.label_nb} (${filter.unit})`
    : filter.label_nb;
}

function WtbCriterionField({
  filter,
  value,
  onChange,
  brandGroup,
  brandName,
  bounds,
}: {
  filter: CategoryFilter;
  value: WtbAttributeValue | undefined;
  onChange: (v: WtbAttributeValue | undefined) => void;
  brandGroup: VehicleBrandGroup;
  brandName: string | undefined;
  bounds: Parameters<typeof dynamicBoundsForFilter>[1];
}) {
  if (filter.type === "brand_select") {
    return (
      <VehicleBrandField
        categoryGroup={(filter.unit ?? "bil") as VehicleBrandGroup}
        value={typeof value === "string" ? value : undefined}
        onChange={(v) => onChange(v)}
      />
    );
  }

  if (filter.type === "model_select") {
    return (
      <VehicleModelWithClassField
        categoryGroup={brandGroup}
        brandName={brandName}
        value={typeof value === "string" ? value : undefined}
        onChange={(v) => onChange(v)}
      />
    );
  }

  if (filter.key === EU_CONTROL_KEY) {
    const minDate = isWtbDateMinValue(value) ? value.minDate : "";
    return (
      <div className="space-y-2">
        <EuControlDateField
          id={`wtb-attr-${filter.key}`}
          value={minDate}
          onChange={(v) => onChange(v ? { minDate: v } : undefined)}
        />
        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Søket matcher annonser der neste EU-kontroll er på valgt dato eller lengre frem i tid.
          </span>
        </div>
      </div>
    );
  }

  if (filter.type === "select" || filter.type === "multiselect") {
    const options = filter.options ?? [];
    // Older WTB listings stored a single select value as a string.
    const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const toggle = (val: string) => {
      const next = selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val];
      onChange(next.length > 0 ? next : undefined);
    };
    return (
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <label key={o.value} className="native-touch-target flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
            />
            {o.label_nb}
          </label>
        ))}
      </div>
    );
  }

  if (filter.type === "number" || filter.type === "range") {
    const range = isWtbRangeValue(value) ? value : {};
    return (
      <RangeFilterField
        label={filter.unit ? `${filter.label_nb} (${filter.unit})` : filter.label_nb}
        bounds={dynamicBoundsForFilter(filter, bounds)}
        value={range}
        onChange={(next) => onChange(next.min == null && next.max == null ? undefined : next)}
      />
    );
  }

  if (filter.type === "boolean") {
    return (
      <label className="native-touch-target flex items-center gap-2 text-sm">
        <Checkbox
          checked={value === true}
          onCheckedChange={(c) => onChange(c === true ? true : undefined)}
        />
        Ja
      </label>
    );
  }

  // text
  const fieldId = `wtb-attr-${filter.key}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId} className="sr-only">
        {filter.label_nb}
      </Label>
      <Input
        id={fieldId}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}
