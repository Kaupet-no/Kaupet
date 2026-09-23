import { useMemo, useState } from "react";
import {
  ChevronRight,
  Eye,
  EyeOff,
  FolderOpen,
  MapPin,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSheet } from "@/components/ui/native-sheet";
import { NativeChoiceSheet } from "@/components/ui/native-choice-sheet";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategorySlugPicker } from "@/components/advanced-search-sheet";
import { ModeToggle } from "@/components/search-term-mode-toggle";
import { TermGroupRow } from "@/components/term-group-editor";
import { SecondaryCategoryFilters } from "@/components/attribute-filter-chips";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import { describeAttrValue } from "@/components/active-filters";
import { RangeFilterField } from "@/components/range-filter-field";
import { PRICE_BOUNDS, type RangeBounds } from "@/lib/filter-range-bounds";
import { conditionOptionsFor, type AdvancedSearchValue } from "@/components/advanced-search-value";
import { buildTree, isCategorySelectionComplete, type Category } from "@/lib/categories";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import { emptyTermGroup, type TermGroup } from "@/lib/term-groups";
import {
  splitPrimaryFilters,
  type AttributeFilterValue,
  type CategoryFilter,
} from "@/lib/category-filters";
import { rankSearchFilters } from "@/features/listing-search/rank-search-filters";
import { hapticImpact } from "@/lib/haptics";
import type { ActiveFilterItem } from "./active-filter-items";

/** Section keys, kept from the old tab strip (fase 9) — now scroll targets
 * inside one continuous list instead of separate tab panels (fase 12). */
export type SearchFilterSection = "search" | "categories" | "price" | "location" | "attributes";

type Props = {
  value: AdvancedSearchValue;
  setValue: React.Dispatch<React.SetStateAction<AdvancedSearchValue>>;
  categories: Category[];
  /** Seksjonen panelet skal scrolle til når den endres — en "hopp hit"-input,
   * ikke en tab-valgt tilstand (fase 12 erstattet fanene med én scrollende
   * liste, se komponentkommentaren). */
  section: SearchFilterSection;
  /** Valgfri eksplisitt stedstilstand for eldre kallere. SearchPanel og
   * lagret-søk-redigering bruker normalt sted fra samme utkast som resten. */
  location?: LocationValue;
  onLocationChange?: (v: LocationValue) => void;
  /** Query text used to prioritize filters matching the current intent. */
  queryText?: string;
  /** Kategoriens sekundære attributtfiltre. Utelatt betyr ingen egen seksjon. */
  attributeFilters?: CategoryFilter[];
  attributeValues?: Record<string, AttributeFilterValue>;
  onAttributeChange?: (key: string, value: AttributeFilterValue | undefined) => void;
  attributeCounts?: Record<string, Record<string, number>>;
  /** Result-aware bounds for the first-class price column. */
  priceBounds?: RangeBounds;
  /** Se `SecondaryCategoryFilters`: søkepanelet må vise hele filtersettet,
   * siden det er eneste vei dit på native etter fase 9. */
  includePrimary?: boolean;
  /** Oppsett: "drilldown" er telefonens én-seksjon-om-gangen-liste,
   * "expanded" er nettleserens sidekolonne der alle seksjoner står åpne
   * samtidig og hvert valg gjelder umiddelbart. Samme seksjoner, samme
   * tilstand — bare kroppen skiller (se docs/ARCHITECTURE.md § plattform). */
  layout?: "drilldown" | "expanded" | "workspace";
  /** Desktop-sidekolonnen viser ett sett felt om gangen. Uten denne propen
   * beholder mobilweb-dialogen alle felt på én flate. */
  desktopGroup?: "basis" | "details" | "more";
  /** Ruten eier kategorien (kategorilandingssidene) — da skjules kategori-
   * valget helt, i stedet for å vise en velger siden overstyrer. */
  hideCategory?: boolean;
  /** Aktive filtertagger — vises øverst med swipe-for-å-fjerne (fase 12).
   * Utelatt (ikke bare tom liste) skjuler seksjonen helt, for kallere som
   * ikke sporer aktive filtre som en flat liste (mine-sok.tsx). */
  activeItems?: ActiveFilterItem[];
  /** Native-søket viser disse valgene ved søkefeltet i stedet. */
  hideSearchOptions?: boolean;
};

/**
 * Parameterseksjonene (Aktive filter · Kategori · Pris · Tilstand · Sted ·
 * Mer · Søk) som både `SearchPanel` (fase 9/12) og `NativeAdvancedSearch`
 * (redigering av lagret søk) rendrer. Én scrollende liste i stedet for faner
 * (fase 12) — å dra panelet til fullskjerm skal gi mer synlig innhold, ikke
 * bare mer luft under én fane. Utkastholdingen, headeren og bunnknappene eies
 * av kallstedet — denne komponenten er bare seksjonene.
 */
export function SearchFilterSections({
  value: v,
  setValue: setV,
  categories,
  section,
  location: locationProp,
  queryText,
  onLocationChange: onLocationChangeProp,
  attributeFilters,
  attributeValues,
  onAttributeChange,
  attributeCounts,
  priceBounds = PRICE_BOUNDS,
  includePrimary = false,
  layout = "drilldown",
  desktopGroup,
  hideCategory = false,
  activeItems,
  hideSearchOptions = false,
}: Props) {
  const [editingGroup, setEditingGroup] = useState<TermGroup | null>(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(
    layout === "workspace" || section === "categories",
  );
  const [activeSection, setActiveSection] = useState<SearchFilterSection>(section);
  const [activeAttributeKey, setActiveAttributeKey] = useState<string | null>(null);
  const [mobileGroup, setMobileGroup] = useState<"basis" | "details" | "more">("basis");
  // Sidekolonnen: alltid åpen så lenge ingen kategori er valgt (også etter
  // «Nullstill»), ellers bare når brukeren selv har trykket «Endre».
  const [categoryEditOpen, setCategoryEditOpen] = useState(false);
  const categoryTree = useMemo(() => buildTree(categories), [categories]);
  const expanded = layout === "expanded";
  const workspace = layout === "workspace";
  /** I sidekolonnen står alt åpent; i skuffen vises én seksjon om gangen. */
  const showSection = (key: SearchFilterSection) => {
    if (hideSearchOptions && key === "search") return false;
    if (workspace && overviewOpen) return mobileGroup === "basis" && key === "price";
    if (!expanded) return activeSection === key;
    if (!desktopGroup) return true;
    if (desktopGroup === "basis") return key === "location" || key === "price";
    if (desktopGroup === "details") return key === "attributes";
    return key === "attributes" || key === "search";
  };
  const sectionClass = expanded
    ? `scroll-mt-2 border-t border-border/70 first:border-0 first:pt-0 ${desktopGroup ? "space-y-3 pt-4" : "space-y-4 pt-6"}`
    : "density-task mt-4 scroll-mt-2 space-y-5";
  const labelClass = expanded ? "text-sm font-semibold tracking-tight" : "text-base font-semibold";

  // Falls back to editing the draft's own location when no live location is
  // passed in (saved-search editing on mine-sok.tsx), so the "Sted" section
  // works in both contexts without a second code path.
  const location = locationProp ?? v.location;
  const onLocationChange =
    onLocationChangeProp ??
    ((next: LocationValue) => setV((prev) => ({ ...prev, location: next })));
  const locationActive = location.lat != null;
  const hasAttributeFilters =
    attributeFilters != null && attributeValues != null && onAttributeChange != null;
  const selectedCategories = categories.filter((category) => v.categories.includes(category.slug));
  const conditionOptions = conditionOptionsFor(v.categories);
  const categorySummary =
    selectedCategories.length === 0
      ? "Alle kategorier"
      : selectedCategories.length === 1
        ? selectedCategories[0].name_nb
        : `${selectedCategories[0].name_nb} +${selectedCategories.length - 1}`;
  const advancedFilterCount = Object.keys(attributeValues ?? {}).length;
  const primaryFilters = attributeFilters
    ? rankSearchFilters({
        filters: splitPrimaryFilters(attributeFilters).primary,
        activeValues: attributeValues,
        queryText: queryText ?? v.terms.join(" "),
        facetCounts: attributeCounts,
        limit: 6,
      })
    : [];
  const secondaryFilters = attributeFilters
    ? rankSearchFilters({
        filters: splitPrimaryFilters(attributeFilters).secondary,
        activeValues: attributeValues,
        queryText: queryText ?? v.terms.join(" "),
        facetCounts: attributeCounts,
        limit: 6,
      })
    : [];
  const priceSummary =
    v.min != null || v.max != null
      ? `${v.min?.toLocaleString("nb-NO") ?? "0"}–${v.max?.toLocaleString("nb-NO") ?? "∞"} kr`
      : "Alle priser";
  const locationSummary = locationActive
    ? `${location.label || "Valgt sted"} · ${location.radius} km`
    : "Hele Norge";
  const advancedSearchSummary = [
    v.extraGroups.length
      ? `${v.extraGroups.length} ${v.extraGroups.length === 1 ? "regel" : "regler"}`
      : null,
    v.qMode === "any" ? "Minst ett ord" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const attributeSummary = (filter: CategoryFilter) => {
    const value = attributeValues?.[filter.key];
    if (!value) return "Alle";
    if (value.kind === "multiselect" || value.kind === "exclude") {
      const labels = value.values.map(
        (entry) => filter.options?.find((option) => option.value === entry)?.label_nb ?? entry,
      );
      return labels.length > 2
        ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`
        : labels.join(", ");
    }
    return describeAttrValue(filter, value);
  };

  const saveGroup = (group: TermGroup) => {
    if (group.terms.length === 0) {
      setEditingGroup(null);
      return;
    }
    void hapticImpact("medium");
    setV((prev) => {
      const exists = prev.extraGroups.some((g) => g.id === group.id);
      return {
        ...prev,
        extraGroups: exists
          ? prev.extraGroups.map((g) => (g.id === group.id ? group : g))
          : [...prev.extraGroups, group],
      };
    });
    setEditingGroup(null);
  };

  const removeGroup = (id: string) => {
    void hapticImpact("light");
    setV((prev) => ({ ...prev, extraGroups: prev.extraGroups.filter((g) => g.id !== id) }));
  };

  const openSection = (next: SearchFilterSection, attributeKey?: string) => {
    setActiveAttributeKey(attributeKey ?? null);
    setActiveSection(next);
    setOverviewOpen(false);
  };

  const overview = (
    <div className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(6rem+var(--safe-bottom))]">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Tilpass søket
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">Finn det du leter etter</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeItems?.length
            ? `${activeItems.length} filtre valgt`
            : "Velg det som er viktigst for deg."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {!hideCategory && (
          <FilterOverviewRow
            label="Kategori"
            value={categorySummary}
            onClick={() => openSection("categories")}
            icon={FolderOpen}
            active={v.categories.length > 0}
          />
        )}
        <FilterOverviewRow
          label="Sted"
          value={locationSummary}
          onClick={() => openSection("location")}
          icon={MapPin}
          active={locationActive}
        />
        <FilterOverviewRow
          label="Pris"
          value={priceSummary}
          onClick={() => openSection("price")}
          icon={Tag}
          active={v.min != null || v.max != null}
        />
        <FilterOverviewRow
          label="Tilstand"
          value={v.conditions.length ? `${v.conditions.length} valgt` : "Alle"}
          onClick={() => setConditionsOpen(true)}
          active={v.conditions.length > 0}
        />
      </div>
      {primaryFilters.length > 0 && (
        <p className="mb-3 mt-7 text-sm font-semibold">Mer om {categorySummary.toLowerCase()}</p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {primaryFilters.map((filter) => (
          <FilterOverviewRow
            key={filter.id}
            label={filter.label_nb}
            value={attributeSummary(filter)}
            onClick={() => openSection("attributes", filter.key)}
            active={attributeValues?.[filter.key] != null}
          />
        ))}
      </div>
      <p className="mb-3 mt-7 text-sm font-semibold">Flere muligheter</p>
      <div className="grid grid-cols-2 gap-2.5">
        <FilterOverviewRow
          label="Alle filtre"
          value={advancedFilterCount ? `${advancedFilterCount} aktive` : "Ingen"}
          onClick={() => openSection("attributes")}
          icon={SlidersHorizontal}
          active={advancedFilterCount > 0}
        />
        {!hideSearchOptions && (
          <FilterOverviewRow
            label="Flere søkevalg"
            value={advancedSearchSummary || "Ingen"}
            onClick={() => openSection("search")}
            active={Boolean(advancedSearchSummary)}
          />
        )}
      </div>
    </div>
  );

  /** Selve seksjonene — delt mellom skuffens én-om-gangen-visning og
   * sidekolonnens alt-åpent-visning, så det finnes bare ett filtersett. */
  const sectionFields = (
    <>
      {showSection("location") && (
        <section
          data-section="location"
          className={desktopGroup === "basis" ? undefined : `${sectionClass} space-y-4`}
        >
          {desktopGroup === "basis" ? (
            <button
              type="button"
              onClick={() => setLocationOpen(true)}
              className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-medium">Sted</span>
              <span className="min-w-0 text-right text-muted-foreground">
                {locationSummary} <ChevronRight className="inline size-4" aria-hidden />
              </span>
            </button>
          ) : (
            <>
              <Label className={labelClass}>Sted</Label>
              <LocationPicker value={location} onChange={onLocationChange} autoFocus={false} />
              {locationActive && (
                <RadiusPicker
                  value={location.radius}
                  compact={Boolean(desktopGroup)}
                  onChange={(r) => onLocationChange({ ...location, radius: r })}
                />
              )}
            </>
          )}
        </section>
      )}

      {showSection("price") && (
        <section data-section="price" className={`${sectionClass} space-y-6`}>
          <div className="space-y-3">
            {/* Ingen egen seksjonstittel — RangeFilterField rendrer selv en
                "Pris (NOK)"-label rett under. */}
            <RangeFilterField
              label="Pris (NOK)"
              compact={Boolean(desktopGroup)}
              bounds={priceBounds}
              value={{ min: v.min ?? undefined, max: v.max ?? undefined }}
              onChange={({ min, max }) =>
                setV((prev) => ({ ...prev, min: min ?? null, max: max ?? null }))
              }
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Raske prisvalg">
              {[50_000, 100_000, 250_000]
                .filter((max) => max <= priceBounds.max)
                .map((max) => (
                  <Button
                    key={max}
                    type="button"
                    variant={v.max === max ? "default" : "secondary"}
                    size={desktopGroup ? "sm" : "default"}
                    className={`${desktopGroup ? "h-9" : "min-h-12 rounded-full"} flex-1 px-3 text-xs`}
                    disabled={v.min != null && max < v.min}
                    onClick={() => setV((previous) => ({ ...previous, max }))}
                    aria-label={`Inntil ${max.toLocaleString("nb-NO")}`}
                    aria-pressed={v.max === max}
                  >
                    {/* Sidekolonnen er smal — «≤» i stedet for «Inntil». */}
                    {expanded ? "≤ " : "Inntil "}
                    {max.toLocaleString("nb-NO")}
                  </Button>
                ))}
            </div>
            <label
              className={`flex cursor-pointer items-center gap-3 ${expanded ? "" : "min-h-11"}`}
            >
              <Checkbox
                checked={v.includeFree}
                onCheckedChange={(c) => {
                  void hapticImpact("light");
                  setV((prev) => ({ ...prev, includeFree: c === true }));
                }}
                id="adv-free"
              />
              <Label
                htmlFor="adv-free"
                className={`cursor-pointer ${expanded ? "text-sm" : "text-base"}`}
              >
                Inkluder gratis-annonser
              </Label>
            </label>
          </div>
        </section>
      )}

      {showSection("attributes") && (
        <section data-section="attributes" className={`${sectionClass} space-y-4`}>
          <Label className={labelClass}>
            {activeAttributeKey
              ? attributeFilters?.find((filter) => filter.key === activeAttributeKey)?.label_nb
              : desktopGroup === "details"
                ? "Om kategorien"
                : desktopGroup === "more"
                  ? "Flere filtre"
                  : "Alle filtre"}
          </Label>
          {hasAttributeFilters && v.categories.length > 0 ? (
            activeAttributeKey ? (
              <CategoryFilterFields
                filters={attributeFilters!.filter((filter) => filter.key === activeAttributeKey)}
                brandLookupFilters={attributeFilters}
                values={attributeValues!}
                onChange={onAttributeChange!}
                counts={attributeCounts}
                isNative={!expanded}
                compactRanges={Boolean(desktopGroup)}
              />
            ) : desktopGroup === "details" ? (
              splitPrimaryFilters(attributeFilters!).primary.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  <CategoryFilterFields
                    filters={splitPrimaryFilters(attributeFilters!).primary}
                    brandLookupFilters={attributeFilters}
                    values={attributeValues!}
                    onChange={onAttributeChange!}
                    counts={attributeCounts}
                    compactRanges={Boolean(desktopGroup)}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ingen hovedfiltre for denne kategorien.
                </p>
              )
            ) : (
              <SecondaryCategoryFilters
                filters={attributeFilters!}
                values={attributeValues!}
                onChange={onAttributeChange!}
                counts={attributeCounts}
                /* Sidekolonnen følger rekkefølgen administrator har satt i
                   admin (category_filters.sort_order). Relevanssorteringen
                   etter søketeksten hører hjemme der plassen er knapp og
                   filtrene ligger bak et trykk — ikke der alle står synlige. */
                queryText={expanded ? undefined : (queryText ?? v.terms.join(" "))}
                isNative={!expanded}
                compactRanges={Boolean(desktopGroup)}
                includePrimary={desktopGroup === "more" ? false : includePrimary}
                // Denne seksjonen er alltid synlig i sidekolonnen (ikke bak et
                // eksplisitt "åpne filter"-trykk), så autofokus her ville
                // rykket siden ned til søkefeltet så snart en hovedkategori
                // velges. Se `SecondaryCategoryFilters`.
                autoFocusSearch={false}
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => !expanded && openSection("categories")}
              disabled={expanded}
              className="native-touch-target flex w-full items-center rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground disabled:cursor-default"
            >
              Velg kategori for å se kategorispesifikke filtre
            </button>
          )}
        </section>
      )}

      {showSection("search") && (
        <section key="search" className={`${sectionClass} space-y-3`}>
          <Label className={labelClass}>Søket skal matche</Label>

          <ModeToggle
            value={v.qMode}
            onChange={(qMode) => setV((previous) => ({ ...previous, qMode }))}
            labels={["Alle ordene", "Minst ett ord"]}
          />

          {v.extraGroups.map((g) => (
            <div
              key={g.id}
              className={`flex min-h-14 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left ${
                g.exclude ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  void hapticImpact("light");
                  setEditingGroup(g);
                }}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <span
                  className={`mt-0.5 shrink-0 ${g.exclude ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {g.exclude ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-medium ${g.exclude ? "text-destructive" : ""}`}
                  >
                    {g.exclude
                      ? "Skjul annonser som inneholder"
                      : g.mode === "all"
                        ? "Må inneholde"
                        : "Kan inneholde"}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {g.terms.length > 0 ? g.terms.join(", ") : "Ingen ord lagt til"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeGroup(g.id)}
                className="native-hit-area shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Fjern regel"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void hapticImpact("light");
              setEditingGroup(emptyTermGroup());
            }}
            className="w-fit justify-start px-2 text-muted-foreground hover:text-foreground native:h-auto native:w-full native:rounded-xl native:border native:border-dashed native:border-border native:px-4 native:py-3 native:hover:border-primary native:hover:bg-transparent native:hover:text-primary native:active:scale-[0.98]"
          >
            <Plus className="size-4" />
            Legg til regel
          </Button>
        </section>
      )}
    </>
  );

  /** Kategori redigeres i den aktive filterflaten på begge skjermstørrelser. */
  const categoryField = (
    <>
      {!hideCategory && (
        <section
          data-section="categories"
          className={
            desktopGroup === "basis" ? "border-b border-border" : `${sectionClass} space-y-3`
          }
        >
          {desktopGroup === "basis" ? (
            <>
              <button
                type="button"
                onClick={() => setCategoryEditOpen((open) => !open)}
                aria-expanded={categoryEditOpen}
                className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-medium">Kategori</span>
                <span className="min-w-0 text-right text-muted-foreground">
                  {categorySummary}{" "}
                  <ChevronRight
                    className={`inline size-4 transition-transform ${categoryEditOpen ? "rotate-90" : ""}`}
                    aria-hidden
                  />
                </span>
              </button>
              {categoryEditOpen && (
                <div className="pb-4">
                  <CategorySlugPicker
                    categories={categories}
                    selected={v.categories}
                    onChange={(slugs) =>
                      setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))
                    }
                    variant="icons"
                    showLabel={false}
                    compact
                  />
                </div>
              )}
            </>
          ) : categoryEditOpen || !isCategorySelectionComplete(v.categories, categoryTree) ? (
            <>
              <CategorySlugPicker
                categories={categories}
                selected={v.categories}
                onChange={(slugs) =>
                  setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))
                }
              />
              {v.categories.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setCategoryEditOpen(false)}
                >
                  Ferdig
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <Label className={labelClass}>Kategori</Label>
                <p className="truncate text-sm text-muted-foreground">{categorySummary}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 px-2 text-primary"
                onClick={() => setCategoryEditOpen(true)}
              >
                Endre
              </Button>
            </div>
          )}
        </section>
      )}
    </>
  );
  const conditionsField = (
    <section data-section="conditions" className={`${sectionClass} space-y-3`}>
      <Label className={labelClass}>Tilstand</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Velg tilstand">
        {conditionOptions.map((condition) => (
          <button
            key={condition.value}
            type="button"
            aria-pressed={v.conditions.includes(condition.value)}
            className={`min-h-12 ${desktopGroup ? "rounded-md px-3" : "rounded-full px-4"} border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${v.conditions.includes(condition.value) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent hover:text-accent-foreground"}`}
            onClick={() =>
              setV((prev) => ({
                ...prev,
                conditions: prev.conditions.includes(condition.value)
                  ? prev.conditions.filter((entry) => entry !== condition.value)
                  : [...prev.conditions, condition.value],
              }))
            }
          >
            {condition.label}
          </button>
        ))}
      </div>
    </section>
  );

  const workspaceOverview = (
    <div
      className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6"
      data-testid="filter-workspace"
    >
      <Tabs
        value={mobileGroup}
        onValueChange={(next) => setMobileGroup(next as typeof mobileGroup)}
      >
        <TabsList className="sticky top-0 z-10 grid h-auto w-full grid-cols-3 gap-1 rounded-none border-b border-border bg-background py-2">
          <TabsTrigger
            value="basis"
            className="min-h-12 rounded-lg text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            Basis
          </TabsTrigger>
          <TabsTrigger
            value="details"
            className="min-h-12 rounded-lg text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            Detaljer
          </TabsTrigger>
          <TabsTrigger
            value="more"
            className="min-h-12 rounded-lg text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            Mer
          </TabsTrigger>
        </TabsList>
        <TabsContent value={mobileGroup} className="mt-0">
          <div className="mt-4 rounded-xl bg-primary/5 p-3 text-sm">
            <p className="font-semibold">Søket ditt</p>
            <p className="mt-1 text-muted-foreground">
              {[
                v.categories.length ? categorySummary : null,
                ...(activeItems ?? []).map((item) => item.label),
                v.min != null || v.max != null ? priceSummary : null,
                ...v.conditions.map(
                  (condition) =>
                    conditionOptions.find((option) => option.value === condition)?.label ??
                    condition,
                ),
                !v.includeFree ? "Uten gratisannonser" : null,
                v.qMode === "any" ? "Minst ett ord" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Ingen filtre valgt"}
            </p>
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-primary">
            {mobileGroup === "basis" ? "Basis" : mobileGroup === "details" ? "Detaljer" : "Mer"}
          </p>
          <h3 className="mt-1 font-display text-2xl tracking-tight">
            {mobileGroup === "basis"
              ? "Start bredt, snevre inn"
              : mobileGroup === "details"
                ? "Om kategorien"
                : "Spesifikke behov"}
          </h3>
          {mobileGroup === "basis" ? (
            <>
              <div className="mt-3">
                {!hideCategory && (
                  <FilterOverviewRow
                    label="Kategori"
                    value={categorySummary}
                    onClick={() => openSection("categories")}
                    icon={FolderOpen}
                    active={v.categories.length > 0}
                    quiet
                  />
                )}
                <FilterOverviewRow
                  label="Sted"
                  value={locationSummary}
                  onClick={() => openSection("location")}
                  icon={MapPin}
                  active={locationActive}
                  quiet
                />
              </div>
              <div className="mt-5">{sectionFields}</div>
              <div className="mt-5">{conditionsField}</div>
            </>
          ) : mobileGroup === "details" ? (
            <div className="mt-3">
              {primaryFilters.length ? (
                primaryFilters.map((filter) => (
                  <FilterOverviewRow
                    key={filter.id}
                    label={filter.label_nb}
                    value={attributeSummary(filter)}
                    onClick={() => openSection("attributes", filter.key)}
                    active={attributeValues?.[filter.key] != null}
                    quiet
                  />
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => openSection("categories")}
                  className="native-touch-target mt-2 flex min-h-14 w-full items-center justify-between rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground"
                >
                  Velg kategori for å se detaljfiltre
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3">
              {secondaryFilters.map((filter) => (
                <FilterOverviewRow
                  key={filter.id}
                  label={filter.label_nb}
                  value={attributeSummary(filter)}
                  onClick={() => openSection("attributes", filter.key)}
                  active={attributeValues?.[filter.key] != null}
                  quiet
                />
              ))}
              <FilterOverviewRow
                label="Alle filtre"
                value={advancedFilterCount ? `${advancedFilterCount} aktive` : "Ingen"}
                onClick={() => openSection("attributes")}
                icon={SlidersHorizontal}
                active={advancedFilterCount > 0}
                quiet
              />
              {!hideSearchOptions && (
                <FilterOverviewRow
                  label="Flere søkevalg"
                  value={advancedSearchSummary || "Ingen"}
                  onClick={() => openSection("search")}
                  active={Boolean(advancedSearchSummary)}
                  quiet
                />
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <>
      {expanded ? (
        <div className="@container space-y-1">
          {desktopGroup ? (
            <>
              {desktopGroup === "basis" && categoryField}
              {sectionFields}
              {desktopGroup === "basis" && conditionsField}
            </>
          ) : (
            <>
              {categoryField}
              {conditionsField}
              {sectionFields}
            </>
          )}
        </div>
      ) : overviewOpen ? (
        workspace ? (
          workspaceOverview
        ) : (
          overview
        )
      ) : activeSection === "categories" && !hideCategory ? (
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[calc(6rem+var(--safe-bottom))]">
          <button
            type="button"
            onClick={() => setOverviewOpen(true)}
            className="native-touch-target mb-4 flex items-center px-1 text-sm font-medium text-primary"
          >
            Tilbake til filteroversikt
          </button>
          <h2 className="mb-4 font-display text-2xl tracking-tight">Velg kategori</h2>
          <CategorySlugPicker
            categories={categories}
            selected={v.categories}
            onChange={(slugs) => setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))}
            variant="icons"
            showLabel={false}
          />
        </div>
      ) : (
        <div className="@container flex-1 overflow-y-auto px-4 py-5 pb-[calc(6rem+var(--safe-bottom))]">
          <button
            type="button"
            onClick={() => setOverviewOpen(true)}
            className="native-touch-target mb-4 flex items-center px-1 text-sm font-medium text-primary"
          >
            Tilbake til filteroversikt
          </button>
          {sectionFields}
        </div>
      )}

      {desktopGroup ? (
        <>
          <ResponsiveOverlay open={locationOpen} onOpenChange={setLocationOpen}>
            <ResponsiveOverlayContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Velg sted</DialogTitle>
              </DialogHeader>
              <LocationPicker value={location} onChange={onLocationChange} autoFocus={false} />
              {locationActive && (
                <RadiusPicker
                  value={location.radius}
                  compact
                  onChange={(r) => onLocationChange({ ...location, radius: r })}
                />
              )}
              <Button type="button" onClick={() => setLocationOpen(false)}>
                Ferdig
              </Button>
            </ResponsiveOverlayContent>
          </ResponsiveOverlay>
        </>
      ) : null}

      <NativeChoiceSheet
        open={conditionsOpen}
        onOpenChange={setConditionsOpen}
        title="Tilstand"
        options={conditionOptions.map((condition) => ({
          value: condition.value,
          label: condition.label,
        }))}
        value={v.conditions}
        multiple
        onChange={(conditions) => setV((previous) => ({ ...previous, conditions }))}
        onApply={() => setConditionsOpen(false)}
      />

      {/* Term group sheet — its own Radix Dialog, stacks above the panel since
          it only mounts (and portals) once the user opens it */}
      <TermGroupSheet
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSave={saveGroup}
      />
    </>
  );
}

function FilterOverviewRow({
  label,
  value,
  onClick,
  icon: Icon,
  active = false,
  quiet = false,
}: {
  label: string;
  value: string;
  onClick: () => void;
  icon?: LucideIcon;
  active?: boolean;
  quiet?: boolean;
}) {
  if (quiet) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
          {label}
        </span>
        <span
          className={`flex min-w-0 items-center gap-1 text-right text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}
        >
          <span className="break-words">{value}</span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`native-touch-target flex min-h-28 w-full flex-col items-start rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"}`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        {Icon ? (
          <Icon
            className={`size-5 ${active ? "text-primary" : "text-muted-foreground"}`}
            aria-hidden
          />
        ) : (
          <span
            className={`size-1.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
            aria-hidden
          />
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </span>
      <span className="mt-3 block text-sm font-semibold leading-tight">{label}</span>
      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
        {value}
      </span>
    </button>
  );
}

export function TermGroupSheet({
  group,
  onClose,
  onSave,
  onRemove,
  title = "Flere søkevalg",
}: {
  group: TermGroup | null;
  onClose: () => void;
  onSave: (g: TermGroup) => void;
  onRemove?: (id: string) => void;
  title?: string;
}) {
  if (!group) return null;
  return (
    <OpenTermGroupSheet
      key={group.id}
      group={group}
      onClose={onClose}
      onSave={onSave}
      onRemove={onRemove}
      title={title}
    />
  );
}

function OpenTermGroupSheet({
  group,
  onClose,
  onSave,
  onRemove,
  title,
}: {
  group: TermGroup;
  onClose: () => void;
  onSave: (g: TermGroup) => void;
  onRemove?: (id: string) => void;
  title: string;
}) {
  const [draft, setDraft] = useState<TermGroup>(group);

  const updateDraft = (next: TermGroup) => {
    void hapticImpact("light");
    setDraft(next);
  };

  return (
    <NativeSheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      titleVisible
      expandable
      className="overflow-y-auto"
    >
      <div className="mt-4">
        <TermGroupRow
          group={draft}
          onChange={updateDraft}
          onRemove={onRemove ? () => onRemove(group.id) : undefined}
        />
      </div>

      <Button
        type="button"
        size="lg"
        className="mt-6 w-full"
        disabled={draft.terms.length === 0}
        onClick={() => onSave(draft)}
      >
        {draft.terms.length === 0 ? "Legg til minst ett ord" : "Bruk regel"}
      </Button>
    </NativeSheet>
  );
}
