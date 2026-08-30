import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SlidersHorizontal, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSheet } from "@/components/ui/native-sheet";
import { Select, SelectContent, SelectItem, SelectTriggerBare } from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterChip } from "@/components/filter-chip";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import { PartVehicleSearchField } from "@/components/part-fitment-fields";
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";
import { RangeFilterField } from "@/components/range-filter-field";
import { CONDITIONS } from "@/components/advanced-search-value";
import { PRICE_BOUNDS } from "@/lib/filter-range-bounds";
import { digitsOnlyClamped, formatThousands } from "@/lib/number-input";
import {
  useVehicleBrandOptions,
  VehicleModelMultiComboboxContent,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import {
  getAttributeChipState,
  getPriceChipState,
  getConditionChipState,
} from "@/lib/filter-chip-labels";
import { splitPrimaryFilters } from "@/lib/category-filters";
import { hapticImpact } from "@/lib/haptics";
import {
  PART_FITMENT_VEHICLE_IDS_KEY,
  SEARCH_MULTISELECT_KEYS,
  type AttributeFilterValue,
  type CategoryFilter,
  type VehicleBrandGroup,
} from "@/lib/category-filters";

/**
 * The homepage's single-brand widget stores its pick as `{ kind: "select" }`
 * (see `category-filter-fields.tsx`), while this results page lets a buyer
 * check several brands and stores that as `{ kind: "multiselect" }`. Accept
 * either shape so a brand chosen on the homepage still shows as selected
 * here, and still unlocks the Modell chip.
 */
function brandSelectValues(value: AttributeFilterValue | undefined): string[] {
  if (value?.kind === "multiselect") return value.values;
  if (value?.kind === "select") return [value.value];
  return [];
}

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
  /** Whether a category is currently selected. When false and `filters` is
   * empty (no category-scoped filters to show), a hint is rendered in their
   * place pointing the user at the category picker instead of leaving the
   * row silently empty. */
  hasCategory?: boolean;
  /** Facet result counts per filter key/value (e.g. `{ fuel_type: { diesel: 98 } }`),
   * shown next to options in chip popovers and the "Flere filter" dialog. */
  counts?: Record<string, Record<string, number>>;
  /** "chips" (default): the horizontal-scroll pill row. "card": a bordered
   * card with a labeled field per primary filter, plus an "up to"-only price
   * field and a city/radius field — matches mobile.de's landing-page search
   * widget. Desktop-only; native ignores this. */
  layout?: "chips" | "card";
  /** City/radius filter, shown as its own field in `layout="card"`. Desktop
   * callers already own this state for `NativeFilterChips` — pass it through
   * here too rather than duplicating it. */
  location?: LocationValue;
  onLocationChange?: (v: LocationValue) => void;
  /** Clears every active filter — shown as a "Nullstill" link next to "Se
   * flere filter" in `layout="card"`. */
  onReset?: () => void;
  /** Skips the card's own `rounded-2xl border ... shadow-sm` wrapper — for
   * embedding the field grid inside a caller that already supplies its own
   * card chrome (the homepage's category-drilldown panel), so the fields
   * don't end up double-boxed. `layout="card"` only. */
  embedCard?: boolean;
  /** When set, "Flere filter" links to the dedicated `/annonser/filter` page
   * (current search params preserved) instead of opening the in-place
   * dialog — used by `/annonser` itself, which owns that page. Other card
   * callers (landing pages) keep the dialog since they aren't on `/annonser`. */
  moreFilterHref?: boolean;
  /** Extra content in the card's bottom bar, alongside "Nullstill"/"Flere
   * filter" — `footerLeft` sits before them (e.g. a live result count),
   * `footerRight` after (e.g. a "Vis treff" submit button for a caller that
   * navigates elsewhere instead of filtering in place). `layout="card"` only. */
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
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
 * The searchable grid of a category's secondary (non-primary) attribute
 * filters — the content of "Flere filter" on desktop, and of the native
 * advanced-search panel's "Mer" tab. Extracted so both surfaces share one
 * implementation of the search-to-filter and relevance-sort behavior instead
 * of drifting apart.
 */
export function SecondaryCategoryFilters({
  filters,
  values,
  onChange,
  counts,
  queryText,
  isNative = false,
  includePrimary = false,
  autoFocusSearch,
}: {
  /** Full filter set for the category — split into primary/secondary here,
   * same as `AttributeFilterChips`. */
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  onChange: (key: string, value: AttributeFilterValue | undefined) => void;
  counts?: Record<string, Record<string, number>>;
  /** Same relevance-boost input as `AttributeFilterChips`' `queryText`. */
  queryText?: string;
  isNative?: boolean;
  /** Ta med primærfiltrene (Merke, Modell …) i stedet for bare de sekundære.
   * Søkepanelet (fase 9) er eneste vei til kategorifiltrene på native etter at
   * chip-raden ble erstattet av sammendrag-pillen, så der må hele settet med. */
  includePrimary?: boolean;
  /** Autofokuser søkefeltet på mount. Standard `!isNative`, som passer når
   * dette rendres inne i en overlay brukeren nettopp åpnet (f.eks. "Flere
   * filter"-dialogen) — der er fokus forventet. I sidekolonnen (`expanded`
   * layout i `filter-sections.tsx`) rendres komponenten derimot alltid synlig
   * med `isNative={!expanded}`, så autofokus der ville rykket siden ned til
   * feltet hver gang en hovedkategori velges. Send `false` eksplisitt der. */
  autoFocusSearch?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { secondary: secondaryOnly } = splitPrimaryFilters(filters);
  const secondaryRaw = includePrimary ? filters : secondaryOnly;
  const queryWords = (queryText ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const secondary =
    queryWords.length === 0
      ? secondaryRaw
      : [...secondaryRaw].sort(
          (a, b) => relevanceScore(b, queryWords) - relevanceScore(a, queryWords),
        );

  if (secondary.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ingen flere filter tilgjengelig for denne kategorien.
      </p>
    );
  }

  const searchTrimmed = search.trim();
  const searchWords = searchTrimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const visible =
    searchTrimmed.length < 2
      ? secondary
      : secondary.filter((f) => relevanceScore(f, searchWords) > 0);

  return (
    <div className="space-y-4">
      {secondary.length > 5 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søk etter filter…"
          autoFocus={autoFocusSearch ?? !isNative}
        />
      )}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen filter matcher «{search}».</p>
      ) : (
        /* Beholderbredde, ikke vindusbredde: samme liste rendres både i en
           290px sidekolonne og i en 512px dialog. */
        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
          <CategoryFilterFields
            filters={visible}
            brandLookupFilters={filters}
            values={values}
            onChange={onChange}
            counts={counts}
            isNative={isNative}
          />
        </div>
      )}
    </div>
  );
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
  hasCategory = true,
  counts,
  layout = "chips",
  location,
  onLocationChange,
  onReset,
  embedCard = false,
  moreFilterHref = false,
  footerLeft,
  footerRight,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [priceConditionOpen, setPriceConditionOpen] = useState<"price" | "condition" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const isCard = layout === "card" && !isNative;
  const fieldProps = isCard ? { variant: "field" as const } : {};

  // Desktop callers wire up Pris/Tilstand here so all visible search criteria
  // live in one row/component; native keeps them in NativeFilterChips.
  const showPriceCondition = !isNative && onPriceChange != null;

  if (filters.length === 0 && !showPriceCondition && hasCategory) return null;

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
      counts={counts}
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
          {...fieldProps}
          fieldLabel={f.label_nb}
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

    // Karosseri/Farge/Drivstoff: a listing has one value, but a buyer
    // narrowing search should be able to check several allowed values —
    // see SEARCH_MULTISELECT_KEYS.
    if (f.type === "select" && SEARCH_MULTISELECT_KEYS.includes(f.key)) {
      const selected = current?.kind === "multiselect" ? current.values : [];
      return (
        <AttributeMultiChip
          key={f.id}
          filter={f}
          label={label}
          active={active}
          values={selected}
          counts={counts?.[f.key]}
          onChange={(vals) =>
            onChange(f.key, vals.length > 0 ? { kind: "multiselect", values: vals } : undefined)
          }
          {...fieldProps}
          fieldLabel={f.label_nb}
        />
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
          options={(f.options ?? []).map((o) => ({
            value: o.value,
            label:
              counts?.[f.key]?.[o.value] != null
                ? `${o.label_nb} (${counts[f.key][o.value]})`
                : o.label_nb,
          }))}
          value={current?.kind === "select" ? current.value : undefined}
          placeholder={f.label_nb}
          onChange={(v) => onChange(f.key, v ? { kind: "select", value: v } : undefined)}
          {...fieldProps}
          fieldLabel={f.label_nb}
        />
      );
    }
    if (f.type === "brand_select") {
      const selected = brandSelectValues(current);
      return (
        <BrandMultiChip
          key={f.id}
          filter={f}
          label={label}
          active={active}
          values={selected}
          counts={counts?.[f.key]}
          onChange={(vals) =>
            onChange(f.key, vals.length > 0 ? { kind: "multiselect", values: vals } : undefined)
          }
          {...fieldProps}
          fieldLabel={f.label_nb}
        />
      );
    }
    if (f.type === "model_select") {
      const brandFilter = filters.find((bf) => bf.type === "brand_select");
      const brandValues = brandFilter ? brandSelectValues(values[brandFilter.key]) : [];
      const selected = current?.kind === "multiselect" ? current.values : [];
      return (
        <ModelMultiChip
          key={f.id}
          brandFilter={brandFilter}
          brandValues={brandValues}
          label={label}
          active={active}
          values={selected}
          counts={counts?.[f.key]}
          onChange={(vals) =>
            onChange(f.key, vals.length > 0 ? { kind: "multiselect", values: vals } : undefined)
          }
          {...fieldProps}
          fieldLabel={f.label_nb}
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
          {...fieldProps}
        />
      );
    }

    // Bilmodellisten er søkbar og kan bli høyere enn plassen rundt chipen.
    // Bruk et modal-overlay i stedet for en ankret popover, ellers kan
    // Radix flippe menyen opp over filterpanelet (særlig på forsiden).
    if (f.key === PART_FITMENT_VEHICLE_IDS_KEY) {
      const selected = current?.kind === "multiselect" ? current.values : [];
      const chip = (
        <PartVehicleFilterChip
          label={label}
          active={active}
          values={selected}
          onClick={() => {
            if (isNative) void hapticImpact("light");
            openField(f.key);
          }}
          variant={fieldProps.variant}
          fieldLabel={f.label_nb}
        />
      );
      if (isNative) return <span key={f.id}>{chip}</span>;
      return (
        <ResponsiveOverlay
          key={f.id}
          open={openKey === f.key}
          onOpenChange={(o) => openField(o ? f.key : null)}
        >
          {chip}
          <ResponsiveOverlayContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{f.label_nb}</DialogTitle>
            </DialogHeader>
            <PartVehicleSearchField
              value={values[f.key]}
              onChange={(next) => onChange(f.key, next)}
              contentOnly
            />
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      );
    }

    // Multi-control fields (multiselect, from–to ranges, free text) still need
    // a surface to open into.
    const chip = (
      <FilterChip
        label={label}
        active={active}
        onClick={isNative ? () => openField(f.key) : undefined}
        {...fieldProps}
        fieldLabel={f.label_nb}
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

  // Card layout: Pris is a bare "opp til"-input right in the row (mobile.de
  // style) instead of a popover — the full min–max slider still lives in the
  // "Flere filter" dialog for buyers who want finer control.
  const priceChip =
    showPriceCondition &&
    (isCard ? (
      <PriceUpToField
        value={max}
        onChange={(mx) => onPriceChange?.(min, mx, includeFree ?? true)}
      />
    ) : (
      <Popover
        open={priceConditionOpen === "price"}
        onOpenChange={(o) => setPriceConditionOpen(o ? "price" : null)}
      >
        <PopoverTrigger asChild>
          <FilterChip label={priceLabel} active={priceActive} />
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
    ));

  const conditionChip = showPriceCondition && !hideCondition && (
    <Popover
      open={priceConditionOpen === "condition"}
      onOpenChange={(o) => setPriceConditionOpen(o ? "condition" : null)}
    >
      <PopoverTrigger asChild>
        <FilterChip
          label={condLabel}
          active={condActive}
          icon={!isCard ? <span className="text-xs">✦</span> : undefined}
          {...fieldProps}
          fieldLabel="Tilstand"
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

  // City/radius — desktop card layout only; native keeps its own sheet in
  // NativeFilterChips, and the chip-row layout has never surfaced this field
  // (only Pris/Tilstand share the row with the category-attribute chips).
  const locationLabel = location?.lat != null ? (location.label?.split(",")[0] ?? "Sted") : "Sted";
  const cityField = isCard && onLocationChange && (
    <Popover open={locationOpen} onOpenChange={setLocationOpen}>
      <PopoverTrigger asChild>
        <FilterChip
          label={locationLabel}
          active={location?.lat != null}
          variant="field"
          fieldLabel="By eller postnummer"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <LocationPicker
          value={location ?? { lat: null, lng: null, radius: 20 }}
          onChange={onLocationChange}
          onDone={() => setLocationOpen(false)}
        />
        <RadiusPicker
          value={location?.radius ?? 20}
          onChange={(r) =>
            onLocationChange({ ...(location ?? { lat: null, lng: null, radius: 20 }), radius: r })
          }
          disabled={location?.lat == null}
        />
      </PopoverContent>
    </Popover>
  );

  const moreButtonContent = (
    <>
      <SlidersHorizontal className="size-3.5" />
      Flere filter
      {secondaryCount > 0 && (
        <span
          className={
            isCard
              ? "flex size-4 items-center justify-center rounded-full bg-brand text-2xs font-bold text-white"
              : "absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-2xs font-bold text-white"
          }
        >
          {secondaryCount}
        </span>
      )}
    </>
  );
  const moreButtonClassName = isCard
    ? "relative gap-1.5 px-0 text-primary hover:bg-transparent"
    : "relative h-9 shrink-0 gap-1.5 rounded-full";
  // Native has no "Flere filter" trigger of its own — its secondary filters
  // live in the "Mer" tab of NativeAdvancedSearch (see annonser.tsx), reached
  // through NativeFilterChips' single "Mer" chip instead of a second button.
  const moreButton =
    secondary.length > 0 &&
    !isNative &&
    (moreFilterHref ? (
      <Button
        type="button"
        variant={isCard ? "ghost" : "outline"}
        size="sm"
        className={moreButtonClassName}
        asChild
      >
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared component, not tied to one route's search type */}
        <Link to="/annonser/filter" search={(prev: any) => prev}>
          {moreButtonContent}
        </Link>
      </Button>
    ) : (
      <Button
        type="button"
        variant={isCard ? "ghost" : "outline"}
        size="sm"
        className={moreButtonClassName}
        onClick={() => setMoreOpen(true)}
      >
        {moreButtonContent}
      </Button>
    ));

  const resetLink = isCard && onReset && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      onClick={onReset}
    >
      <RotateCcw className="size-3.5" />
      Nullstill
    </Button>
  );
  // The overlay's own close control handles dismissal on web and narrow viewports.
  const overlayBody = (
    <SecondaryCategoryFilters
      filters={filters}
      values={values}
      onChange={onChange}
      counts={counts}
      queryText={queryText}
    />
  );

  // Card layout: one bordered card, primary fields in a responsive grid with
  // labels above each (mobile.de-style), "Flere filter"/"Nullstill" as plain
  // links along the bottom instead of buttons in the field row.
  const cardFields = (
    <div className={embedCard ? undefined : "density-task border-y border-border"}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {chips}
        {priceChip}
        {cityField}
        {!hideCondition && conditionChip}
      </div>
      {(moreButton || resetLink || footerLeft || footerRight) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>{footerLeft}</div>
          <div className="flex flex-wrap items-center gap-4">
            {resetLink}
            {moreButton}
            {footerRight}
          </div>
        </div>
      )}
    </div>
  );

  // Native keeps its own horizontally-scrolling row — merging it with
  // NativeFilterChips' row would just make one wider scroll strip, with no
  // benefit on the narrow viewports it targets. Desktop instead returns a
  // fragment: the caller wraps it together with DesktopFilterChips in one
  // shared flex-wrap row, so Pris/Tilstand and Merke/Modell can share a line.
  const body = (
    <>
      {isCard ? (
        cardFields
      ) : (
        <>
          {priceChip}
          {conditionChip}
          {chips}
          {moreButton}
        </>
      )}

      {/* Native: one bottom sheet per primary field that needs a surface. */}
      {isNative &&
        primary.filter(needsSurface).map((f) => (
          <NativeSheet
            key={f.id}
            open={openKey === f.key}
            onOpenChange={(o) => !o && openField(null)}
            title={f.label_nb}
            titleVisible
            expandable
            className="overflow-y-auto"
          >
            <div className="mt-4 space-y-4">
              {fieldFor(f)}
              {dismissButton(() => openField(null))}
            </div>
          </NativeSheet>
        ))}

      {/* "Se flere filter" overlay — web only; native uses NativeAdvancedSearch. */}
      {secondary.length > 0 && !isNative && (
        <ResponsiveOverlay open={moreOpen} onOpenChange={setMoreOpen}>
          <ResponsiveOverlayContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" expandable>
            <DialogHeader>
              <DialogTitle>Flere filter</DialogTitle>
            </DialogHeader>
            {overlayBody}
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      )}
    </>
  );

  // No wrapping row here on native — the caller (annonser.tsx,
  // category-landing-page.tsx) renders this together with NativeFilterChips
  // inside one shared scroll row, so Pris/Sted/Mer and Merke/Modell read as
  // one filter bar instead of two stacked ones.
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

/** Above this, "Pris opp til" reads as "no cap" rather than a real ceiling —
 * typing a higher number clears the filter instead of silently clamping to
 * some arbitrary max the buyer never asked for. */
const PRICE_UPTO_MAX = 99_999_999;

/** The card layout's Pris field: a bare "opp til" number input right in the
 * row (mobile.de style), styled to match `FilterChip`'s "field" variant box.
 * Min stays whatever it already was — the card only ever writes `max`; the
 * full min–max slider (`RangeFilterField`, via `PricePopoverContent`) still
 * lives in the "Flere filter" dialog for buyers who want a lower bound too. */
function PriceUpToField({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (max: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);
  const commit = () => {
    const n = draft ? Number(draft) : undefined;
    if (n != null && n > PRICE_UPTO_MAX) {
      setDraft("");
      onChange(undefined);
      return;
    }
    onChange(n);
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">Pris opp til</span>
      <div className="relative">
        <Input
          inputMode="numeric"
          placeholder="Ingen grense"
          value={formatThousands(draft, PRICE_UPTO_MAX * 10)}
          onChange={(e) => setDraft(digitsOnlyClamped(e.target.value, PRICE_UPTO_MAX * 10))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="h-11 pr-8"
        />
        {draft && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            kr
          </span>
        )}
      </div>
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
  variant,
  fieldLabel,
}: {
  label: string;
  active: boolean;
  options: { value: string; label: string }[];
  value: string | undefined;
  /** Shown as the "clear" option's label, e.g. "Alle drivstoff". */
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
  variant?: "pill" | "field";
  fieldLabel?: string;
}) {
  return (
    <Select
      value={value ?? ALL}
      disabled={disabled}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
    >
      <SelectTriggerBare asChild>
        <FilterChip
          label={label}
          active={active}
          disabled={disabled}
          variant={variant}
          fieldLabel={fieldLabel}
        />
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

/** Shared searchable checkbox-list popover body for the Merke/Modell
 * multiselect chips below — picking one option never closes the popover,
 * since checking one brand/model is exactly when a user is most likely to
 * want to check another (that's the whole point of the breadcrumb "broaden
 * the search" behavior this exists for). The search box matters here since
 * these lists (e.g. every car brand) can run well past what fits on screen. */
function MultiSelectPopoverBody({
  options,
  values,
  onToggle,
  emptyMessage,
  counts,
}: {
  options: { value: string; label: string }[];
  values: string[];
  onToggle: (value: string) => void;
  emptyMessage?: string;
  /** Result counts keyed by option value, e.g. `{ diesel: 98 }`. */
  counts?: Record<string, number>;
}) {
  const [search, setSearch] = useState("");
  if (options.length === 0 && emptyMessage) {
    return <p className="p-2 text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <Command shouldFilter>
      <CommandInput placeholder="Søk…" value={search} onValueChange={setSearch} />
      <CommandList className="max-h-80">
        <CommandEmpty>Ingen treff.</CommandEmpty>
        <CommandGroup>
          {options.map((o) => (
            <CommandItem key={o.value} value={o.label} onSelect={() => onToggle(o.value)}>
              <Check
                className={cn("size-4", values.includes(o.value) ? "opacity-100" : "opacity-0")}
              />
              {counts?.[o.value] != null ? `${o.label} (${counts[o.value]})` : o.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** Karosseri/Farge/Drivstoff as a checkbox list rather than a single-pick
 * dropdown — see SEARCH_MULTISELECT_KEYS for why these `type: "select"`
 * filters get a multi-value chip in search despite each listing only
 * carrying one value. */
function AttributeMultiChip({
  filter,
  label,
  active,
  values,
  counts,
  onChange,
  variant,
  fieldLabel,
}: {
  filter: CategoryFilter;
  label: string;
  active: boolean;
  values: string[];
  counts?: Record<string, number>;
  onChange: (values: string[]) => void;
  variant?: "pill" | "field";
  fieldLabel?: string;
}) {
  const options = (filter.options ?? []).map((o) => ({ value: o.value, label: o.label_nb }));
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip label={label} active={active} variant={variant} fieldLabel={fieldLabel} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <MultiSelectPopoverBody
          options={options}
          values={values}
          onToggle={toggle}
          counts={counts}
        />
      </PopoverContent>
    </Popover>
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
  counts,
  onChange,
  variant,
  fieldLabel,
}: {
  filter: CategoryFilter;
  label: string;
  active: boolean;
  values: string[];
  counts?: Record<string, number>;
  onChange: (values: string[]) => void;
  variant?: "pill" | "field";
  fieldLabel?: string;
}) {
  const options = useVehicleBrandOptions((filter.unit ?? "bil") as VehicleBrandGroup, undefined);
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip label={label} active={active} variant={variant} fieldLabel={fieldLabel} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <MultiSelectPopoverBody
          options={options}
          values={values}
          onToggle={toggle}
          counts={counts}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Modell as a searchable, class-grouped checkbox list, sourced from every
 * currently-selected brand at once (not just one) — checking a second brand
 * in BrandMultiChip immediately adds that brand's models here too. The body
 * (search box, class headers, "{klasse} (Alle)" rows) is shared with the
 * front page's model filter via `VehicleModelMultiComboboxContent`. */
function ModelMultiChip({
  brandFilter,
  brandValues,
  label,
  active,
  values,
  counts,
  onChange,
  variant,
  fieldLabel,
}: {
  brandFilter: CategoryFilter | undefined;
  brandValues: string[];
  label: string;
  active: boolean;
  values: string[];
  counts?: Record<string, number>;
  onChange: (values: string[]) => void;
  variant?: "pill" | "field";
  fieldLabel?: string;
}) {
  const categoryGroup = (brandFilter?.unit ?? "bil") as VehicleBrandGroup;
  const brandKnown = brandValues.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip
          label={brandKnown ? label : "Velg merke først"}
          active={active}
          disabled={!brandKnown}
          variant={variant}
          fieldLabel={fieldLabel}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <VehicleModelMultiComboboxContent
          categoryGroup={categoryGroup}
          brandNames={brandValues}
          values={values}
          onChange={onChange}
          counts={counts}
        />
      </PopoverContent>
    </Popover>
  );
}

function PartVehicleFilterChip({
  label,
  active,
  values,
  onClick,
  variant,
  fieldLabel,
}: {
  label: string;
  active: boolean;
  values: string[];
  onClick?: () => void;
  variant?: "pill" | "field";
  fieldLabel?: string;
}) {
  const { data: brands } = useAllVehicleBrands();
  const { data: models } = useAllVehicleModels();
  const allBrandLabel = useMemo(() => {
    if (!brands || !models || values.length === 0) return null;
    const selectedModels = models.filter((model) => values.includes(model.id));
    const brandIds = new Set(selectedModels.map((model) => model.brand_id));
    if (selectedModels.length !== values.length || brandIds.size !== 1) return null;
    const brandId = selectedModels[0]?.brand_id;
    const brandModels = models.filter((model) => model.brand_id === brandId);
    if (brandModels.length !== values.length) return null;
    if (!brandModels.every((model) => values.includes(model.id))) return null;
    const brandName = brands.find((brand) => brand.id === brandId)?.name;
    return brandName ? `${brandName} (alle)` : null;
  }, [brands, models, values]);

  return (
    <FilterChip
      label={allBrandLabel ?? label}
      active={active}
      onClick={onClick}
      variant={variant}
      fieldLabel={fieldLabel}
    />
  );
}
