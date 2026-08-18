import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SEARCH_MULTISELECT_KEYS,
  type AttributeFilterValue,
  type CategoryFilter,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
import {
  VehicleBrandField,
  VehicleModelMultiField,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import { RangeFilterField } from "@/components/range-filter-field";
import { boundsForFilter } from "@/lib/filter-range-bounds";
import { ComboboxMultiContent } from "@/components/combobox-field";
import { EuControlDateField } from "@/components/eu-control-date-field";
import { EU_CONTROL_KEY } from "@/features/wtb/wtb-criteria-types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeChoiceSheet } from "@/components/ui/native-choice-sheet";

/** "Tillatt hengervekt" only makes sense once "Hengerfeste" is on, so the two
 * are grouped into one field with the weight range disabled until then. */
const TOW_HITCH_KEY = "tow_hitch";
const MAX_TOW_WEIGHT_KEY = "max_tow_weight_kg";
/** "Vekt" and "Tillatt totalvekt" are grouped together as a pair of related
 * weight fields, no dependency between the two (unlike Hengerfeste above). */
const WEIGHT_KEY = "weight_kg";
const MAX_TOTAL_WEIGHT_KEY = "max_total_weight_kg";

/**
 * Trigger button for the "Se flere valg" `Collapsible` wrapping a category's
 * secondary filters — shared by the landing page and category page so the
 * label/icon behavior (and the +count hint) can't drift between the two.
 */
export function MoreFiltersToggle({ open, count }: { open: boolean; count?: number }) {
  return (
    <CollapsibleTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1 px-0 text-primary hover:bg-transparent"
      >
        {open ? "Vis færre valg" : count ? `Se flere valg (+${count})` : "Se flere valg"}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
    </CollapsibleTrigger>
  );
}

/**
 * Renders the configurable filter controls for a category's `CategoryFilter`s
 * (boolean/select/multiselect/text/range), driving them off externally-owned
 * state so the same UI can be embedded both on the category page and in the
 * landing page's category picker.
 */
export function CategoryFilterFields({
  filters,
  values,
  onChange,
  brandLookupFilters,
  counts,
  isNative = false,
}: {
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  onChange: (key: string, value: AttributeFilterValue | undefined) => void;
  /** Where to look for the `brand_select` filter a `model_select` depends on.
   * Defaults to `filters`; pass the category's full filter list when rendering
   * a model field in isolation (e.g. its own chip popover on the search page),
   * so the models offered still follow the selected brand. */
  brandLookupFilters?: CategoryFilter[];
  /** Facet result counts per filter key/value (e.g. `{ fuel_type: { diesel: 98 } }`),
   * shown next to select/multiselect option labels when supplied. Omit to
   * render without counts (e.g. the listing wizard, which has no result set). */
  counts?: Record<string, Record<string, number>>;
  /** Search-panel-only: selection lists open in the shared native sheet. */
  isNative?: boolean;
}) {
  const brandScope = brandLookupFilters ?? filters;
  // Shared by the plain range fallback below and the grouped fields
  // (Hengerfeste/Tillatt hengervekt, Vekt/Tillatt totalvekt) so all three
  // read a range value and call onChange the same way.
  const rangeField = (filter: CategoryFilter, disabled?: boolean) => {
    const v = values[filter.key];
    const range = v?.kind === "range" ? v : { min: undefined, max: undefined };
    return (
      <RangeFilterField
        key={filter.id}
        label={filter.label_nb}
        bounds={boundsForFilter(filter)}
        value={{ min: range.min, max: range.max }}
        onChange={(next) =>
          onChange(
            filter.key,
            next.min === undefined && next.max === undefined
              ? undefined
              : { kind: "range", min: next.min, max: next.max },
          )
        }
        disabled={disabled}
      />
    );
  };
  const countLabel = (key: string, value: string, label: string) => {
    const c = counts?.[key]?.[value];
    return c == null ? label : `${label} (${c})`;
  };
  return (
    <>
      {filters.map((f) => {
        const current = values[f.key];

        if (f.type === "brand_select") {
          return (
            <VehicleBrandField
              key={f.id}
              categoryGroup={(f.unit ?? "bil") as VehicleBrandGroup}
              value={current?.kind === "select" ? current.value : undefined}
              onChange={(v) => onChange(f.key, v ? { kind: "select", value: v } : undefined)}
            />
          );
        }
        if (f.type === "model_select") {
          const brandFilter = brandScope.find((bf) => bf.type === "brand_select");
          const brandName =
            brandFilter && values[brandFilter.key]?.kind === "select"
              ? (values[brandFilter.key] as { kind: "select"; value: string }).value
              : undefined;
          // Multiselect (not the wizard's single-value model field) so a
          // whole class can be picked at once via the "{klasse} (Alle)" row —
          // a search filter benefits from "any C-klasse", unlike a listing,
          // which always has exactly one concrete model.
          const modelValues = current?.kind === "multiselect" ? current.values : [];
          return (
            <VehicleModelMultiField
              key={f.id}
              categoryGroup={(brandFilter?.unit ?? "bil") as VehicleBrandGroup}
              brandNames={brandName ? [brandName] : []}
              values={modelValues}
              onChange={(next) =>
                onChange(f.key, next.length > 0 ? { kind: "multiselect", values: next } : undefined)
              }
              counts={counts?.[f.key]}
            />
          );
        }
        // Merke (brand) stays open-vocabulary even once an admin has promoted
        // it to type "select" with suggested options (see suggest_attribute_values
        // / Fase 2.6) — a curated list helps most buyers, but a plain <Select>
        // would block sellers with an uncommon brand, so it gets a combobox
        // instead of the closed dropdown other select filters use. Multiselect
        // (not "text"/"select" single-value) for the same reason vehicle
        // Merke/Modell are — this is search-side (CategoryFilterFields is
        // only used here, not in the listing-creation wizard, which has its
        // own single-value field group), so a buyer should be able to check
        // several brands to broaden the search, not just pick one.
        //
        // Rendered as the checklist directly (not ComboboxMultiField's own
        // label+trigger+popover) — every call site here already supplies its
        // own chrome (the chip's own Popover, or the "Flere valg" sheet/
        // dialog), so wrapping it in a second nested trigger button would
        // force an extra tap just to reach the list inside it.
        if (f.key === "brand" && (f.type === "text" || f.type === "select")) {
          const brandValues = current?.kind === "multiselect" ? current.values : [];
          return (
            <div key={f.id} className="space-y-2">
              <Label>{f.label_nb}</Label>
              <div className="rounded-md border border-border">
                <ComboboxMultiContent
                  values={brandValues}
                  options={f.options ?? []}
                  onToggle={(v) => {
                    const next = brandValues.includes(v)
                      ? brandValues.filter((x) => x !== v)
                      : [...brandValues, v];
                    onChange(
                      f.key,
                      next.length > 0 ? { kind: "multiselect", values: next } : undefined,
                    );
                  }}
                  placeholder={`Søk ${f.label_nb.toLowerCase()} eller skriv inn...`}
                />
              </div>
            </div>
          );
        }
        // Hengerfeste + Tillatt hengervekt are grouped into one field below
        // (rendered when we reach max_tow_weight_kg) — skip tow_hitch's own
        // standalone checkbox here so it isn't rendered twice. Only skip when
        // the category actually has both keys, so a category with just
        // "Hengerfeste" (no weight field) still gets its own checkbox.
        if (f.key === TOW_HITCH_KEY && filters.some((x) => x.key === MAX_TOW_WEIGHT_KEY)) {
          return null;
        }
        if (f.key === MAX_TOW_WEIGHT_KEY) {
          const towHitch = values[TOW_HITCH_KEY];
          const hasTowHitch = towHitch?.kind === "boolean" && towHitch.value;
          return (
            <div key={f.id} className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={hasTowHitch}
                  onCheckedChange={(c) => {
                    onChange(
                      TOW_HITCH_KEY,
                      c === true ? { kind: "boolean", value: true } : undefined,
                    );
                    // Clear the weight filter along with it — otherwise it
                    // stays applied to the search while showing disabled.
                    if (c !== true) onChange(f.key, undefined);
                  }}
                />
                Hengerfeste
              </label>
              {rangeField(f, !hasTowHitch)}
            </div>
          );
        }
        // Vekt + Tillatt totalvekt are grouped into one field, same reasoning
        // as Hengerfeste/Tillatt hengervekt above — just without a
        // disable relationship, since both stand on their own.
        if (f.key === WEIGHT_KEY && filters.some((x) => x.key === MAX_TOTAL_WEIGHT_KEY)) {
          return null;
        }
        if (f.key === MAX_TOTAL_WEIGHT_KEY) {
          const weightFilter = filters.find((x) => x.key === WEIGHT_KEY);
          return (
            <div key={f.id} className="space-y-4">
              {weightFilter && rangeField(weightFilter)}
              {rangeField(f)}
            </div>
          );
        }
        // "Tidligst neste EU-kontroll" — a search-only earliest-date filter,
        // not the plain text box its category_filters.type="text" would
        // otherwise render. Mirrors the same key's date picker in the WTB
        // criteria form (wtb-criteria-fields.tsx).
        if (f.key === EU_CONTROL_KEY) {
          const minDate = current?.kind === "date_min" ? current.value : "";
          return (
            <div key={f.id} className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Tidligst neste EU-kontroll</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Om dette filteret"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 text-xs text-muted-foreground">
                    Søket matcher annonser der neste EU-kontroll er på valgt dato eller senere.
                  </PopoverContent>
                </Popover>
              </div>
              <EuControlDateField
                id={`attr-${f.key}`}
                value={minDate}
                onChange={(v) => onChange(f.key, v ? { kind: "date_min", value: v } : undefined)}
              />
            </div>
          );
        }
        if (f.type === "boolean") {
          return (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={current?.kind === "boolean" ? current.value : false}
                onCheckedChange={(c) =>
                  onChange(f.key, c === true ? { kind: "boolean", value: true } : undefined)
                }
              />
              {f.label_nb}
            </label>
          );
        }
        if (f.type === "select" && !SEARCH_MULTISELECT_KEYS.includes(f.key)) {
          if (isNative) {
            return (
              <NativeOptionFilter
                key={f.id}
                filter={f}
                value={current?.kind === "select" ? [current.value] : []}
                counts={counts?.[f.key]}
                onChange={(next) =>
                  onChange(f.key, next[0] ? { kind: "select", value: next[0] } : undefined)
                }
              />
            );
          }
          return (
            <div key={f.id} className="space-y-2">
              <Label>{f.label_nb}</Label>
              <Select
                value={current?.kind === "select" ? current.value : "__all__"}
                onValueChange={(v) =>
                  onChange(f.key, v === "__all__" ? undefined : { kind: "select", value: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle</SelectItem>
                  {(f.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {countLabel(f.key, o.value, o.label_nb)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        if (f.type === "multiselect" || SEARCH_MULTISELECT_KEYS.includes(f.key)) {
          const selected = current?.kind === "multiselect" ? current.values : [];
          if (isNative) {
            return (
              <NativeOptionFilter
                key={f.id}
                filter={f}
                value={selected}
                multiple
                counts={counts?.[f.key]}
                onChange={(next) =>
                  onChange(f.key, next.length ? { kind: "multiselect", values: next } : undefined)
                }
              />
            );
          }
          const toggle = (optionValue: string) => {
            const next = selected.includes(optionValue)
              ? selected.filter((v) => v !== optionValue)
              : [...selected, optionValue];
            onChange(f.key, next.length > 0 ? { kind: "multiselect", values: next } : undefined);
          };
          return (
            <Collapsible key={f.id} className="space-y-2">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                >
                  <span>
                    {f.label_nb}
                    {selected.length > 0 ? ` (${selected.length})` : ""}
                  </span>
                  <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
                {(f.options ?? []).map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(o.value)}
                      onCheckedChange={() => toggle(o.value)}
                    />
                    {countLabel(f.key, o.value, o.label_nb)}
                  </label>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        }
        // number / range / text → min/max for numeric, single field for text
        if (f.type === "text") {
          return (
            <div key={f.id} className="space-y-2">
              <Label>{f.label_nb}</Label>
              <Input
                value={current?.kind === "text" ? current.value : ""}
                onChange={(e) =>
                  onChange(
                    f.key,
                    e.target.value ? { kind: "text", value: e.target.value } : undefined,
                  )
                }
              />
            </div>
          );
        }
        return rangeField(f);
      })}
    </>
  );
}

function NativeOptionFilter({
  filter,
  value,
  multiple = false,
  counts,
  onChange,
}: {
  filter: CategoryFilter;
  value: string[];
  multiple?: boolean;
  counts?: Record<string, number>;
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = value.length ? `${value.length} valgt` : "Alle";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="native"
        className="w-full justify-between"
        onClick={() => setOpen(true)}
      >
        {filter.label_nb}
        <span className="text-muted-foreground">{summary}</span>
      </Button>
      <NativeChoiceSheet
        open={open}
        onOpenChange={setOpen}
        title={filter.label_nb}
        options={(filter.options ?? []).map((option) => ({
          ...option,
          label: option.label_nb,
          count: counts?.[option.value],
        }))}
        value={value}
        multiple={multiple}
        onChange={onChange}
        onApply={() => setOpen(false)}
      />
    </>
  );
}
