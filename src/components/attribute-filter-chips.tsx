import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTriggerBare } from "@/components/ui/select";
import { FilterChip } from "@/components/filter-chip";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import {
  useVehicleBrandOptions,
  useVehicleModelOptions,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import { getAttributeChipState } from "@/lib/filter-chip-labels";
import { splitPrimaryFilters } from "@/lib/category-filters";
import { hapticImpact } from "@/lib/haptics";
import type {
  AttributeFilterValue,
  CategoryFilter,
  VehicleBrandGroup,
} from "@/lib/category-filters";

type Props = {
  /** Effective filters for the selected category/categories. Empty when no
   * category is selected — the row then renders nothing. */
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  onChange: (key: string, value: AttributeFilterValue | undefined) => void;
  /** Native uses bottom sheets where desktop uses popovers/dialog. */
  isNative?: boolean;
  /** Current result count, shown on the native sheets' dismiss button the same
   * way NativeFilterChips does. */
  resultCount?: number;
  /** The active free-text search box content — used to bring secondary
   * filters whose label or options match a typed word to the top of "Se
   * flere filter", so e.g. typing "sykkel" surfaces "Hjulstørrelse" instead
   * of leaving it buried in a long, fixed admin-sorted list. Purely a
   * same-session text match, no historical query data required. */
  queryText?: string;
};

/** How many of a filter's typed-word matches count toward its relevance —
 * only used to rank secondary filters, never to hide or filter them out. */
function relevanceScore(filter: CategoryFilter, words: string[]): number {
  if (words.length === 0) return 0;
  const haystacks = [
    filter.label_nb.toLowerCase(),
    ...(filter.options ?? []).map((o) => o.label_nb.toLowerCase()),
  ];
  let score = 0;
  for (const word of words) {
    if (word.length < 2) continue;
    if (haystacks.some((h) => h.includes(word))) score++;
  }
  return score;
}

/**
 * The category-dependent filter row on the search results page: the category's
 * primary filters (Merke, Modell, Drivstoff, Årsmodell …) each get their own
 * always-visible chip, and everything else sits behind "Se flere filter",
 * which opens them in an overlay. Replaces the single "Egenskaper" chip that
 * hid every category field — including the most-used ones — behind one popover.
 */
export function AttributeFilterChips({
  filters,
  values,
  onChange,
  isNative = false,
  resultCount,
  queryText,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  if (filters.length === 0) return null;

  const { primary, secondaryRaw } = (() => {
    const split = splitPrimaryFilters(filters);
    return { primary: split.primary, secondaryRaw: split.secondary };
  })();
  // Same-session relevance boost: filters matching a typed word float to the
  // top, so a search-in-progress makes "Se flere filter" feel search-aware
  // rather than a fixed, admin-only-curated list — see relevanceScore above.
  const queryWords = (queryText ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const secondary =
    queryWords.length === 0
      ? secondaryRaw
      : [...secondaryRaw].sort(
          (a, b) => relevanceScore(b, queryWords) - relevanceScore(a, queryWords),
        );
  const secondaryCount = secondary.filter((f) => values[f.key] !== undefined).length;

  const openField = (key: string | null) => {
    if (key && isNative) void hapticImpact("light");
    setOpenKey(key);
  };

  /** Native sheets have no explicit apply step — values are applied as they
   * change — so the footer button just dismisses, and doubles as the live
   * result count while the user adjusts a filter. */
  const dismissButton = (onDismiss: () => void) =>
    isNative ? (
      <Button
        size="sm"
        className="w-full"
        onClick={() => {
          void hapticImpact("medium");
          onDismiss();
        }}
      >
        {resultCount == null
          ? "Vis annonser"
          : `Vis ${resultCount} annonse${resultCount === 1 ? "" : "r"}`}
      </Button>
    ) : null;

  const fieldFor = (filter: CategoryFilter) => (
    <CategoryFilterFields
      filters={[filter]}
      brandLookupFilters={filters}
      values={values}
      onChange={onChange}
    />
  );

  const chips = primary.map((f) => {
    const { label, active } = getAttributeChipState(f, values[f.key]);
    const current = values[f.key];

    // Single-choice fields put their own menu/toggle on the chip: wrapping them
    // in a popover would cost a second tap to reach the only control inside it.
    if (f.type === "select") {
      return (
        <SelectChip
          key={f.id}
          label={label}
          active={active}
          options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label_nb }))}
          value={current?.kind === "select" ? current.value : undefined}
          placeholder={f.label_nb}
          onChange={(v) => onChange(f.key, v ? { kind: "select", value: v } : undefined)}
        />
      );
    }
    if (f.type === "brand_select") {
      return (
        <BrandChip
          key={f.id}
          filter={f}
          label={label}
          active={active}
          value={current?.kind === "select" ? current.value : undefined}
          onChange={(v) => onChange(f.key, v ? { kind: "select", value: v } : undefined)}
        />
      );
    }
    if (f.type === "model_select") {
      return (
        <ModelChip
          key={f.id}
          filter={f}
          allFilters={filters}
          values={values}
          label={label}
          active={active}
          value={current?.kind === "select" ? current.value : undefined}
          onChange={(v) => onChange(f.key, v ? { kind: "select", value: v } : undefined)}
        />
      );
    }
    if (f.type === "boolean") {
      const on = current?.kind === "boolean" && current.value;
      return (
        <FilterChip
          key={f.id}
          label={f.label_nb}
          active={!!on}
          hideChevron
          onClick={() => {
            if (isNative) void hapticImpact("light");
            onChange(f.key, on ? undefined : { kind: "boolean", value: true });
          }}
        />
      );
    }

    // Multi-control fields (multiselect, from–to ranges, free text) still need
    // a surface to open into.
    const chip = (
      <FilterChip
        label={label}
        active={active}
        onClick={isNative ? () => openField(f.key) : undefined}
      />
    );
    if (isNative) return <span key={f.id}>{chip}</span>;
    return (
      <Popover
        key={f.id}
        open={openKey === f.key}
        onOpenChange={(o) => openField(o ? f.key : null)}
      >
        <PopoverTrigger asChild>{chip}</PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          {fieldFor(f)}
        </PopoverContent>
      </Popover>
    );
  });

  const moreButton = secondary.length > 0 && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="relative h-9 shrink-0 gap-1.5 rounded-full"
      onClick={() => {
        if (isNative) void hapticImpact("light");
        setMoreOpen(true);
      }}
    >
      <SlidersHorizontal className="size-3.5" />
      Se flere filter
      {secondaryCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
          {secondaryCount}
        </span>
      )}
    </Button>
  );

  const overlayBody = (
    <div className="space-y-4">
      <CategoryFilterFields
        filters={secondary}
        brandLookupFilters={filters}
        values={values}
        onChange={onChange}
      />
      {dismissButton(() => setMoreOpen(false))}
    </div>
  );

  return (
    <div
      className={
        isNative
          ? "flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex flex-wrap items-center gap-2"
      }
    >
      {chips}
      {moreButton}

      {/* Native: one bottom sheet per primary field that needs a surface. */}
      {isNative &&
        primary.filter(needsSurface).map((f) => (
          <Sheet key={f.id} open={openKey === f.key} onOpenChange={(o) => !o && openField(null)}>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>{f.label_nb}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {fieldFor(f)}
                {dismissButton(() => openField(null))}
              </div>
            </SheetContent>
          </Sheet>
        ))}

      {/* "Se flere filter" overlay. */}
      {secondary.length > 0 &&
        (isNative ? (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Flere filter</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{overlayBody}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Flere filter</DialogTitle>
              </DialogHeader>
              {overlayBody}
            </DialogContent>
          </Dialog>
        ))}
    </div>
  );
}

/** Filter types whose control doesn't fit on the chip itself and so need a
 * popover/sheet to open into. */
function needsSurface(filter: CategoryFilter): boolean {
  return !["select", "brand_select", "model_select", "boolean"].includes(filter.type);
}

/** Sentinel for "no filter": Radix Select rejects an empty-string item value. */
const ALL = "__all__";

/**
 * A chip that *is* a dropdown trigger, so picking a value takes one tap
 * instead of tapping the chip and then the select inside it.
 */
function SelectChip({
  label,
  active,
  options,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  active: boolean;
  options: { value: string; label: string }[];
  value: string | undefined;
  /** Shown as the "clear" option's label, e.g. "Alle drivstoff". */
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL}
      disabled={disabled}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
    >
      <SelectTriggerBare asChild>
        <FilterChip label={label} active={active} disabled={disabled} />
      </SelectTriggerBare>
      <SelectContent>
        <SelectItem value={ALL}>Alle ({placeholder.toLowerCase()})</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BrandChip({
  filter,
  label,
  active,
  value,
  onChange,
}: {
  filter: CategoryFilter;
  label: string;
  active: boolean;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const options = useVehicleBrandOptions((filter.unit ?? "bil") as VehicleBrandGroup, value);
  return (
    <SelectChip
      label={label}
      active={active}
      options={options}
      value={value}
      placeholder={filter.label_nb}
      onChange={onChange}
    />
  );
}

function ModelChip({
  filter,
  allFilters,
  values,
  label,
  active,
  value,
  onChange,
}: {
  filter: CategoryFilter;
  allFilters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  label: string;
  active: boolean;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const brandFilter = allFilters.find((f) => f.type === "brand_select");
  const brandValue = brandFilter ? values[brandFilter.key] : undefined;
  const brandName = brandValue?.kind === "select" ? brandValue.value : undefined;
  const { options, brandKnown } = useVehicleModelOptions(
    (brandFilter?.unit ?? "bil") as VehicleBrandGroup,
    brandName,
    value,
  );
  return (
    <SelectChip
      label={brandKnown ? label : "Velg merke først"}
      active={active}
      options={options}
      value={value}
      placeholder={filter.label_nb}
      disabled={!brandKnown}
      onChange={onChange}
    />
  );
}
