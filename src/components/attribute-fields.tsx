import { useMemo } from "react";
import { useAllCategoryFilters } from "@/hooks/use-category-filters";
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
  NUMERIC_DIGIT_CAPS,
  PART_FITMENT_SCOPE_KEY,
  PART_FITMENT_VEHICLE_IDS_KEY,
  PART_FITMENT_YEAR_KEY,
  POSITIVE_NUMERIC_ATTRIBUTE_KEYS,
  type AttributeValue,
  type CategoryFilter,
  type CategoryNode,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
import { PartFitmentField } from "@/components/part-fitment-fields";
import {
  VehicleBrandField,
  VehicleModelWithClassField,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";

export type AttributeMap = Record<string, AttributeValue>;

// Hooken bor i src/hooks/use-category-filters.ts; re-eksportert her for
// eksisterende importer.
export { useAllCategoryFilters };

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
  filterKeys,
  heading = "Egenskaper",
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
  /** Optional subset used when a parent groups category fields into sections. */
  filterKeys?: readonly string[];
  /** Section heading. Pass null when the parent supplies the semantic heading. */
  heading?: string | null;
}) {
  const { data: allFilters } = useAllCategoryFilters();

  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const hiddenKeySet = useMemo(() => new Set(hiddenKeys ?? []), [hiddenKeys]);
  const filterKeySet = useMemo(() => (filterKeys ? new Set(filterKeys) : null), [filterKeys]);

  const filters = useMemo(
    () =>
      effectiveFiltersForCategory(categoryId, allFilters ?? [], categoriesById).filter(
        (f) =>
          !hiddenKeySet.has(f.key) &&
          (!filterKeySet || filterKeySet.has(f.key)) &&
          filterDependencyMet(f, value),
      ),
    [categoryId, allFilters, categoriesById, hiddenKeySet, filterKeySet, value],
  );

  const missingKeys = useMemo(() => {
    if (!required || !showErrors) return new Set<string>();
    const missing = getMissingRequiredFilters(categoryId, allFilters ?? [], categoriesById, value);
    return new Set(
      missing.filter((f) => !filterKeySet || filterKeySet.has(f.key)).map((f) => f.key),
    );
  }, [required, showErrors, categoryId, allFilters, categoriesById, value, filterKeySet]);

  if (!categoryId || filters.length === 0) return null;

  const set = (key: string, v: AttributeValue | undefined) => {
    const next = { ...value };
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete next[key];
    else next[key] = v;
    onChange(next);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      {heading && <p className="text-sm font-medium">{heading}</p>}
      {filters.map((f) => {
        if (f.key === PART_FITMENT_SCOPE_KEY) {
          return (
            <PartFitmentField
              key={f.id}
              value={value}
              onChange={onChange}
              required={required}
              scopeError={
                missingKeys.has(PART_FITMENT_SCOPE_KEY)
                  ? "Velg hvordan delen passer til kjøretøy."
                  : undefined
              }
              vehicleError={
                missingKeys.has(PART_FITMENT_VEHICLE_IDS_KEY)
                  ? "Legg til minst én bilmodell."
                  : undefined
              }
            />
          );
        }
        if (f.key === PART_FITMENT_VEHICLE_IDS_KEY || f.key === PART_FITMENT_YEAR_KEY) {
          return null;
        }
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
            <VehicleModelWithClassField
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
  const fieldId = `attr-${filter.key}`;
  const errorId = `${fieldId}-error`;

  if (filter.type === "boolean") {
    const showRequiredMark = required && !filter.is_optional;
    return (
      <div className="space-y-2">
        <Label id={`${fieldId}-label`}>
          {filter.label_nb} {showRequiredMark && <span className="text-destructive">*</span>}
        </Label>
        <div
          role="radiogroup"
          aria-labelledby={`${fieldId}-label`}
          aria-required={showRequiredMark || undefined}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="flex gap-2"
        >
          <button
            type="button"
            role="radio"
            aria-checked={value === true}
            onClick={() => onChange(true)}
            className={`min-h-12 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              value === true
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border hover:border-primary/40"
            }`}
          >
            Ja
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={value === false}
            onClick={() => onChange(false)}
            className={`min-h-12 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              value === false
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border hover:border-primary/40"
            }`}
          >
            Nei
          </button>
        </div>
        {error && (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (filter.type === "select") {
    const options = filter.options ?? [];
    const showRequiredMark = required && !filter.is_optional;
    return (
      <div className="space-y-2">
        <Label htmlFor={fieldId}>
          {label}
          {showRequiredMark && <span className="text-destructive"> *</span>}
          {required && filter.is_optional && (
            <span className="font-normal text-muted-foreground"> (valgfritt)</span>
          )}
        </Label>
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v || undefined)}
        >
          <SelectTrigger
            id={fieldId}
            aria-required={showRequiredMark || undefined}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          >
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
        {error && (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        )}
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
    const showRequiredMark = required && !filter.is_optional;
    return (
      <div className="space-y-2">
        <Label id={`${fieldId}-label`}>
          {label}
          {showRequiredMark && <span className="text-destructive"> *</span>}
          {required && filter.is_optional && (
            <span className="font-normal text-muted-foreground"> (valgfritt)</span>
          )}
        </Label>
        <div
          role="group"
          aria-labelledby={`${fieldId}-label`}
          aria-required={showRequiredMark || undefined}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="flex flex-wrap gap-3"
        >
          {options.map((o) => (
            <label key={o.value} className="flex min-h-12 items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              {o.label_nb}
            </label>
          ))}
        </div>
        {error && (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  // number / range (single value in input context) / text
  const isNumber = filter.type === "number" || filter.type === "range";
  // `range` filters are search-only and so excluded from
  // getMissingRequiredFilters — marking them "*" here promised a validation
  // that never fires. Same for `is_optional` filters.
  const showRequiredMark = required && filter.type !== "range" && !filter.is_optional;
  const digitCap = isNumber ? NUMERIC_DIGIT_CAPS[filter.key] : undefined;
  const requiresPositiveValue = isNumber && POSITIVE_NUMERIC_ATTRIBUTE_KEYS.includes(filter.key);
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>
        {label}
        {showRequiredMark && <span className="text-destructive"> *</span>}
        {required && filter.is_optional && (
          <span className="font-normal text-muted-foreground"> (valgfritt)</span>
        )}
      </Label>
      <Input
        id={fieldId}
        type={isNumber ? "number" : "text"}
        inputMode={isNumber ? "numeric" : undefined}
        aria-required={showRequiredMark || undefined}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        value={value === undefined ? "" : String(value)}
        min={requiresPositiveValue ? 1 : undefined}
        onChange={(e) => {
          let raw = e.target.value;
          if (isNumber && digitCap) raw = raw.replace(/\D/g, "").slice(0, digitCap);
          if (raw === "") return onChange(undefined);
          onChange(isNumber ? Number(raw) : raw);
        }}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
