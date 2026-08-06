import { useMemo } from "react";
import { Info } from "lucide-react";

import { useAllCategoryFilters } from "@/components/attribute-fields";
import { RangeFilterField } from "@/components/range-filter-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/**
 * Renders the search-criteria form for an Ønskes kjøpt listing: one row per
 * effective category filter, each with an activate-checkbox. Unchecked
 * (default) = the criterion is inactive and ignored; filling the field
 * auto-checks it; checking it makes it required before "Neste" (the parent
 * gates on `wtbInvalidCheckedKeys`). Unlike the sell flow's AttributeFields,
 * nothing here is inherently required, selects allow several values, and
 * numerics are from–to sliders scaled by what exists on Kaupet.
 */
export function WtbCriteriaFields({
  categoryId,
  categories,
  value,
  onChange,
  checkedKeys,
  onCheckedKeysChange,
  showErrors,
}: {
  categoryId: string | null;
  categories: CategoryNode[];
  value: WtbAttributeMap;
  onChange: (next: WtbAttributeMap) => void;
  /** Keys the user has activated; a key with a value is always checked. */
  checkedKeys: readonly string[];
  onCheckedKeysChange: (next: string[]) => void;
  /** Shows "fill or deactivate" errors on checked-but-empty criteria. */
  showErrors: boolean;
}) {
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

  const checked = new Set(checkedKeys);

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
    // Typing/selecting a value activates the criterion; clearing it does not
    // deactivate (the user may be mid-edit) — unchecking does that explicitly.
    if (!empty && !checked.has(key)) onCheckedKeysChange([...checkedKeys, key]);
  };

  const toggleChecked = (key: string, on: boolean) => {
    if (on) {
      onCheckedKeysChange([...new Set([...checkedKeys, key])]);
    } else {
      onCheckedKeysChange(checkedKeys.filter((k) => k !== key));
      if (key in value) {
        const next = { ...value };
        delete next[key];
        onChange(next);
      }
    }
  };

  const brandFilter = filters.find((f) => f.type === "brand_select");
  const brandName =
    brandFilter && typeof value[brandFilter.key] === "string"
      ? (value[brandFilter.key] as string)
      : undefined;

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Søkekriterier</p>
      <p className="text-sm text-muted-foreground">
        Kryss av eller fyll ut kun det som betyr noe for deg — alt er valgfritt.
      </p>
      {filters.map((f) => (
        <WtbCriterionRow
          key={f.id}
          filter={f}
          checked={checked.has(f.key)}
          onCheckedChange={(on) => toggleChecked(f.key, on)}
          invalid={showErrors && checked.has(f.key) && !(f.key in value)}
          hideRowLabel={
            f.type === "brand_select" ||
            f.type === "model_select" ||
            ((f.type === "number" || f.type === "range") && f.key !== EU_CONTROL_KEY)
          }
        >
          <WtbCriterionField
            filter={f}
            value={value[f.key]}
            onChange={(v) => setValue(f.key, v)}
            brandGroup={(brandFilter?.unit ?? "bil") as VehicleBrandGroup}
            brandName={brandName}
            bounds={dynamicBounds}
          />
        </WtbCriterionRow>
      ))}
    </div>
  );
}

function WtbCriterionRow({
  filter,
  checked,
  onCheckedChange,
  invalid,
  hideRowLabel,
  children,
}: {
  filter: CategoryFilter;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  invalid: boolean;
  /** Brand/model and slider fields render their own label — skip the row's
   * to avoid a doubled heading. */
  hideRowLabel: boolean;
  children: React.ReactNode;
}) {
  const label =
    filter.key === EU_CONTROL_KEY
      ? "Neste EU-kontroll (tidligst)"
      : filter.unit && filter.type !== "brand_select"
        ? `${filter.label_nb} (${filter.unit})`
        : filter.label_nb;
  return (
    <div
      className={`space-y-2 rounded-lg border p-3 ${
        checked ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <label className="flex items-center gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(c) => onCheckedChange(c === true)}
          aria-label={`Bruk ${label} i søket`}
        />
        {!hideRowLabel && <span className="text-sm font-medium">{label}</span>}
        {hideRowLabel && (
          <span className="text-sm text-muted-foreground">Bruk {label.toLowerCase()} i søket</span>
        )}
      </label>
      {children}
      {invalid && (
        <p className="text-sm text-destructive">
          Fyll ut feltet, eller fjern avkrysningen for å hoppe over det.
        </p>
      )}
    </div>
  );
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
          <label key={o.value} className="flex items-center gap-2 text-sm">
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
      <label className="flex items-center gap-2 text-sm">
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
