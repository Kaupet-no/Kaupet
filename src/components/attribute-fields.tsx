import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  effectiveFiltersForCategory,
  filterDependencyMet,
  getMissingRequiredFilters,
  normalizeFilter,
  type AttributeValue,
  type CategoryFilter,
  type CategoryNode,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
import {
  VehicleBrandField,
  VehicleModelField,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";

export type AttributeMap = Record<string, AttributeValue>;

/** Fetches all category filters once; cached across the app. */
export function useAllCategoryFilters() {
  return useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select(
          "id, category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value",
        )
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });
}

/**
 * Renders one input per effective filter for the given category. Values are a
 * flat key->value map kept by the parent; range filters are not shown here
 * (they are search-only). `select`, `multiselect`, `number`, `boolean` and
 * `text` are supported as single-value inputs.
 */
export function AttributeFields({
  categoryId,
  categories,
  value,
  onChange,
  required = false,
  showErrors = false,
  hiddenKeys,
}: {
  categoryId: string | null;
  categories: CategoryNode[];
  value: AttributeMap;
  onChange: (next: AttributeMap) => void;
  /** When true, filters are treated as required (shows a "*" marker). */
  required?: boolean;
  /** When true (and `required`), shows "required" errors for empty filters. */
  showErrors?: boolean;
  /** Filter keys to skip rendering entirely — e.g. vehicle spec fields
   * already reviewed/edited in the vehicle-confirm step, so the user isn't
   * asked to fill them in a second time here. Values already set for a
   * hidden key are left untouched in `value`/`onChange`. */
  hiddenKeys?: readonly string[];
}) {
  const { data: allFilters } = useAllCategoryFilters();

  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const hiddenKeySet = useMemo(() => new Set(hiddenKeys ?? []), [hiddenKeys]);

  const filters = useMemo(
    () =>
      effectiveFiltersForCategory(categoryId, allFilters ?? [], categoriesById).filter(
        (f) => !hiddenKeySet.has(f.key) && filterDependencyMet(f, value),
      ),
    [categoryId, allFilters, categoriesById, hiddenKeySet, value],
  );

  const missingKeys = useMemo(() => {
    if (!required || !showErrors) return new Set<string>();
    const missing = getMissingRequiredFilters(categoryId, allFilters ?? [], categoriesById, value);
    return new Set(missing.map((f) => f.key));
  }, [required, showErrors, categoryId, allFilters, categoriesById, value]);

  if (!categoryId || filters.length === 0) return null;

  const set = (key: string, v: AttributeValue | undefined) => {
    const next = { ...value };
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete next[key];
    else next[key] = v;
    onChange(next);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Egenskaper</p>
      {filters.map((f) => {
        if (f.type === "brand_select") {
          return (
            <VehicleBrandField
              key={f.id}
              categoryGroup={(f.unit ?? "bil") as VehicleBrandGroup}
              value={typeof value[f.key] === "string" ? (value[f.key] as string) : undefined}
              onChange={(v) => set(f.key, v)}
              required={required}
              error={missingKeys.has(f.key) ? `Fyll inn ${f.label_nb.toLowerCase()}` : undefined}
            />
          );
        }
        if (f.type === "model_select") {
          const brandFilter = filters.find((bf) => bf.type === "brand_select");
          const brandName =
            brandFilter && typeof value[brandFilter.key] === "string"
              ? (value[brandFilter.key] as string)
              : undefined;
          return (
            <VehicleModelField
              key={f.id}
              categoryGroup={(brandFilter?.unit ?? "bil") as VehicleBrandGroup}
              brandName={brandName}
              value={typeof value[f.key] === "string" ? (value[f.key] as string) : undefined}
              onChange={(v) => set(f.key, v)}
              required={required}
              error={missingKeys.has(f.key) ? `Fyll inn ${f.label_nb.toLowerCase()}` : undefined}
            />
          );
        }
        return (
          <AttributeField
            key={f.id}
            filter={f}
            value={value[f.key]}
            onChange={(v) => set(f.key, v)}
            required={required}
            error={missingKeys.has(f.key) ? `Fyll inn ${f.label_nb.toLowerCase()}` : undefined}
          />
        );
      })}
    </div>
  );
}

function AttributeField({
  filter,
  value,
  onChange,
  required,
  error,
}: {
  filter: CategoryFilter;
  value: AttributeValue | undefined;
  onChange: (v: AttributeValue | undefined) => void;
  required?: boolean;
  error?: string;
}) {
  const label = filter.unit ? `${filter.label_nb} (${filter.unit})` : filter.label_nb;

  if (filter.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value === true}
          onCheckedChange={(c) => onChange(c === true ? true : undefined)}
        />
        {filter.label_nb}
      </label>
    );
  }

  if (filter.type === "select") {
    const options = filter.options ?? [];
    return (
      <div className="space-y-2">
        <Label>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v || undefined)}
        >
          <SelectTrigger aria-invalid={!!error}>
            <SelectValue placeholder="Velg…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label_nb}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (filter.type === "multiselect") {
    const options = filter.options ?? [];
    const selected = Array.isArray(value) ? value : [];
    const toggle = (val: string) => {
      const next = selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val];
      onChange(next.length > 0 ? next : undefined);
    };
    return (
      <div className="space-y-2">
        <Label>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // number / range (single value in input context) / text
  const isNumber = filter.type === "number" || filter.type === "range";
  // `range` filters are search-only and so excluded from
  // getMissingRequiredFilters — marking them "*" here promised a validation
  // that never fires.
  const showRequiredMark = required && filter.type !== "range";
  return (
    <div className="space-y-2">
      <Label>
        {label} {showRequiredMark && <span className="text-destructive">*</span>}
      </Label>
      <Input
        type={isNumber ? "number" : "text"}
        aria-invalid={!!error}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(undefined);
          onChange(isNumber ? Number(raw) : raw);
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
