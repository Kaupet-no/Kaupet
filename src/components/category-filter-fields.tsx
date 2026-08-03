import { ChevronDown } from "lucide-react";
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
  VehicleModelWithClassField,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import { RangeFilterField } from "@/components/range-filter-field";
import { boundsForFilter } from "@/lib/filter-range-bounds";
import { ComboboxMultiContent } from "@/components/combobox-field";

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
}: {
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  onChange: (key: string, value: AttributeFilterValue | undefined) => void;
  /** Where to look for the `brand_select` filter a `model_select` depends on.
   * Defaults to `filters`; pass the category's full filter list when rendering
   * a model field in isolation (e.g. its own chip popover on the search page),
   * so the models offered still follow the selected brand. */
  brandLookupFilters?: CategoryFilter[];
}) {
  const brandScope = brandLookupFilters ?? filters;
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
          return (
            <VehicleModelWithClassField
              key={f.id}
              categoryGroup={(brandFilter?.unit ?? "bil") as VehicleBrandGroup}
              brandName={brandName}
              value={current?.kind === "select" ? current.value : undefined}
              onChange={(v) => onChange(f.key, v ? { kind: "select", value: v } : undefined)}
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
                      {o.label_nb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        if (f.type === "multiselect" || SEARCH_MULTISELECT_KEYS.includes(f.key)) {
          const selected = current?.kind === "multiselect" ? current.values : [];
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
                    {o.label_nb}
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
        const range = current?.kind === "range" ? current : { min: undefined, max: undefined };
        return (
          <RangeFilterField
            key={f.id}
            label={f.label_nb}
            bounds={boundsForFilter(f)}
            value={{ min: range.min, max: range.max }}
            onChange={(next) =>
              onChange(
                f.key,
                next.min === undefined && next.max === undefined
                  ? undefined
                  : { kind: "range", min: next.min, max: next.max },
              )
            }
          />
        );
      })}
    </>
  );
}
