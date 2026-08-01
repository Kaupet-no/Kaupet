import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTriggerBare } from "@/components/ui/select";
import { FilterChip } from "@/components/filter-chip";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import { RangeFilterField } from "@/components/range-filter-field";
import { CONDITIONS } from "@/components/advanced-search-value";
import { PRICE_BOUNDS } from "@/lib/filter-range-bounds";
import {
  useVehicleBrandOptions,
  useVehicleModelOptionsForBrands,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import {
  getAttributeChipState,
  getPriceChipState,
  getConditionChipState,
} from "@/lib/filter-chip-labels";
import { splitPrimaryFilters } from "@/lib/category-filters";
import { hapticImpact } from "@/lib/haptics";
import type {
  AttributeFilterValue,
  CategoryFilter,
  VehicleBrandGroup,
} from "@/lib/category-filters";

type Props = {
  /** Effective filters for the selected category/categories. Empty when no
   * category is selected — the row then renders nothing, unless Pris/Tilstand
   * (below) are supplied, in which case those still show. */
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
  /** Pris/Tilstand — generic (non-category) search criteria that share this
   * row on desktop so all visible criteria live in one component/line. Only
   * wired up by desktop callers; native keeps these in NativeFilterChips. */
  min?: number;
  max?: number;
  includeFree?: boolean;
  onPriceChange?: (min: number | undefined, max: number | undefined, includeFree: boolean) => void;
  conditions?: string[];
  onConditionsChange?: (c: string[]) => void;
  /** Hides the "Tilstand" chip — no listing under Bil og MC has that attribute. */
  hideCondition?: boolean;
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
  min,
  max,
  includeFree,
  onPriceChange,
  conditions,
  onConditionsChange,
  hideCondition = false,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [priceConditionOpen, setPriceConditionOpen] = useState<"price" | "condition" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Desktop callers wire up Pris/Tilstand here so all visible search criteria
  // live in one row/component; native keeps them in NativeFilterChips.
  const showPriceCondition = !isNative && onPriceChange != null;

  if (filters.length === 0 && !showPriceCondition) return null;

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

    // Merke (brand) always opens into a surface (ComboboxField, via fieldFor)
    // rather than the closed SelectChip dropdown below — see the matching
    // special-case in category-filter-fields.tsx for why.
    if (f.key === "brand" && (f.type === "text" || f.type === "select")) {
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
    }

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
      const selected = current?.kind === "multiselect" ? current.values : [];
      return (
        <BrandMultiChip
          key={f.id}
          filter={f}
          label={label}
          active={active}
          values={selected}
          onChange={(vals) =>
            onChange(f.key, vals.length > 0 ? { kind: "multiselect", values: vals } : undefined)
          }
        />
      );
    }
    if (f.type === "model_select") {
      const brandFilter = filters.find((bf) => bf.type === "brand_select");
      const brandValues =
        brandFilter && values[brandFilter.key]?.kind === "multiselect"
          ? (values[brandFilter.key] as { kind: "multiselect"; values: string[] }).values
          : [];
      const selected = current?.kind === "multiselect" ? current.values : [];
      return (
        <ModelMultiChip
          key={f.id}
          brandFilter={brandFilter}
          brandValues={brandValues}
          label={label}
          active={active}
          values={selected}
          onChange={(vals) =>
            onChange(f.key, vals.length > 0 ? { kind: "multiselect", values: vals } : undefined)
          }
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

  const { label: priceLabel, active: priceActive } = getPriceChipState(
    min,
    max,
    includeFree ?? true,
  );
  const { label: condLabel, active: condActive } = getConditionChipState(conditions ?? []);

  const priceChip = showPriceCondition && (
    <Popover
      open={priceConditionOpen === "price"}
      onOpenChange={(o) => setPriceConditionOpen(o ? "price" : null)}
    >
      <PopoverTrigger asChild>
        <FilterChip
          label={priceLabel}
          active={priceActive}
          icon={<span className="text-[11px] font-bold">kr</span>}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <PricePopoverContent
          min={min}
          max={max}
          includeFree={includeFree ?? true}
          onApply={(mn, mx, free) => {
            onPriceChange?.(mn, mx, free);
            setPriceConditionOpen(null);
          }}
        />
      </PopoverContent>
    </Popover>
  );

  const conditionChip = showPriceCondition && !hideCondition && (
    <Popover
      open={priceConditionOpen === "condition"}
      onOpenChange={(o) => setPriceConditionOpen(o ? "condition" : null)}
    >
      <PopoverTrigger asChild>
        <FilterChip
          label={condLabel}
          active={condActive}
          icon={<span className="text-[11px]">✦</span>}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex flex-col gap-1">
          {CONDITIONS.map((c) => (
            <label
              key={c.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={(conditions ?? []).includes(c.value)}
                onCheckedChange={(checked) =>
                  onConditionsChange?.(
                    checked
                      ? [...(conditions ?? []), c.value]
                      : (conditions ?? []).filter((v) => v !== c.value),
                  )
                }
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

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

  // Native keeps its own horizontally-scrolling row — merging it with
  // NativeFilterChips' row would just make one wider scroll strip, with no
  // benefit on the narrow viewports it targets. Desktop instead returns a
  // fragment: the caller wraps it together with DesktopFilterChips in one
  // shared flex-wrap row, so Pris/Tilstand and Merke/Modell can share a line.
  const body = (
    <>
      {priceChip}
      {conditionChip}
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
    </>
  );

  if (isNative) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {body}
      </div>
    );
  }
  return body;
}

function PricePopoverContent({
  min,
  max,
  includeFree,
  onApply,
}: {
  min?: number;
  max?: number;
  includeFree: boolean;
  onApply: (min: number | undefined, max: number | undefined, includeFree: boolean) => void;
}) {
  const [draft, setDraft] = useState<{ min?: number; max?: number }>({ min, max });
  const [freeDraft, setFreeDraft] = useState(includeFree);

  return (
    <div className="space-y-3">
      <RangeFilterField label="Pris" bounds={PRICE_BOUNDS} value={draft} onChange={setDraft} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={freeDraft} onCheckedChange={(c) => setFreeDraft(c === true)} />
        Inkluder gratis-annonser
      </label>
      <Button
        type="button"
        size="sm"
        className="w-full"
        onClick={() => onApply(draft.min, draft.max, freeDraft)}
      >
        Bruk prisfilter
      </Button>
    </div>
  );
}

/** Filter types whose control doesn't fit on the chip itself and so need a
 * popover/sheet to open into. */
function needsSurface(filter: CategoryFilter): boolean {
  // Merke (brand) always needs a surface (ComboboxField) even when its type
  // is "select" — see the matching special-case in the chips map above.
  if (filter.key === "brand") return filter.type === "text" || filter.type === "select";
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

/** Shared checkbox-list popover body for the Merke/Modell multiselect chips
 * below — picking one option never closes the popover, since checking one
 * brand/model is exactly when a user is most likely to want to check
 * another (that's the whole point of the breadcrumb "broaden the search"
 * behavior this exists for). */
function MultiSelectPopoverBody({
  options,
  values,
  onToggle,
  emptyMessage,
}: {
  options: { value: string; label: string }[];
  values: string[];
  onToggle: (value: string) => void;
  emptyMessage?: string;
}) {
  if (options.length === 0 && emptyMessage) {
    return <p className="p-2 text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
        >
          <Checkbox checked={values.includes(o.value)} onCheckedChange={() => onToggle(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/** Merke as a checkbox list rather than a single-pick dropdown — landing
 * here via a breadcrumb click (see category-behavior.ts) pre-checks one
 * brand but leaves every other brand checkable, broadening the search
 * instead of narrowing it to a single fixed value. */
function BrandMultiChip({
  filter,
  label,
  active,
  values,
  onChange,
}: {
  filter: CategoryFilter;
  label: string;
  active: boolean;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const options = useVehicleBrandOptions((filter.unit ?? "bil") as VehicleBrandGroup, undefined);
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip label={label} active={active} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <MultiSelectPopoverBody options={options} values={values} onToggle={toggle} />
      </PopoverContent>
    </Popover>
  );
}

/** Modell as a checkbox list, sourced from every currently-selected brand at
 * once (not just one) — checking a second brand in BrandMultiChip
 * immediately adds that brand's models here too. */
function ModelMultiChip({
  brandFilter,
  brandValues,
  label,
  active,
  values,
  onChange,
}: {
  brandFilter: CategoryFilter | undefined;
  brandValues: string[];
  label: string;
  active: boolean;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const options = useVehicleModelOptionsForBrands(
    (brandFilter?.unit ?? "bil") as VehicleBrandGroup,
    brandValues,
    values,
  );
  const brandKnown = brandValues.length > 0;
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip
          label={brandKnown ? label : "Velg merke først"}
          active={active}
          disabled={!brandKnown}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <MultiSelectPopoverBody
          options={options}
          values={values}
          onToggle={toggle}
          emptyMessage={
            brandKnown ? "Ingen modeller funnet." : "Velg minst ett merke for å se modeller."
          }
        />
      </PopoverContent>
    </Popover>
  );
}
