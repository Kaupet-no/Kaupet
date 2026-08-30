import { useMemo, useState } from "react";
import { ChevronRight, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSheet } from "@/components/ui/native-sheet";
import { NativeChoiceSheet } from "@/components/ui/native-choice-sheet";
import { CategoryPicker } from "@/components/advanced-search-sheet";
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
  layout?: "drilldown" | "expanded";
  /** Aktive filtertagger — vises øverst med swipe-for-å-fjerne (fase 12).
   * Utelatt (ikke bare tom liste) skjuler seksjonen helt, for kallere som
   * ikke sporer aktive filtre som en flat liste (mine-sok.tsx). */
  activeItems?: ActiveFilterItem[];
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
  activeItems,
}: Props) {
  const [editingGroup, setEditingGroup] = useState<TermGroup | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(section === "categories");
  const [activeSection, setActiveSection] = useState<SearchFilterSection>(section);
  const [activeAttributeKey, setActiveAttributeKey] = useState<string | null>(null);
  // Sidekolonnen: alltid åpen så lenge ingen kategori er valgt (også etter
  // «Nullstill»), ellers bare når brukeren selv har trykket «Endre».
  const [categoryEditOpen, setCategoryEditOpen] = useState(false);
  const categoryTree = useMemo(() => buildTree(categories), [categories]);
  const expanded = layout === "expanded";
  /** I sidekolonnen står alt åpent; i skuffen vises én seksjon om gangen. */
  const showSection = (key: SearchFilterSection) => expanded || activeSection === key;
  const sectionClass = expanded
    ? "scroll-mt-2 space-y-3 border-t border-border pt-4"
    : "density-task mt-4 scroll-mt-2 border-y border-border";
  const labelClass = expanded ? "text-sm font-semibold" : "text-base font-medium";

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
    if (next === "categories") {
      setCategoryOpen(true);
      return;
    }
    setActiveAttributeKey(attributeKey ?? null);
    setActiveSection(next);
    setOverviewOpen(false);
  };

  const overview = (
    <div className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {activeItems && activeItems.length > 0 && (
        <p className="mb-6 text-sm text-muted-foreground">{activeItems.length} filtre valgt</p>
      )}
      <div className="space-y-2">
        <FilterOverviewRow
          label="Kategori"
          value={categorySummary}
          onClick={() => openSection("categories")}
        />
        <FilterOverviewRow
          label="Sted"
          value={locationSummary}
          onClick={() => openSection("location")}
        />
        <FilterOverviewRow label="Pris" value={priceSummary} onClick={() => openSection("price")} />
        <FilterOverviewRow
          label="Tilstand"
          value={v.conditions.length ? `${v.conditions.length} valgt` : "Alle"}
          onClick={() => setConditionsOpen(true)}
        />
      </div>
      <div className="mt-6 space-y-2">
        {primaryFilters.map((filter) => (
          <FilterOverviewRow
            key={filter.id}
            label={filter.label_nb}
            value={attributeSummary(filter)}
            onClick={() => openSection("attributes", filter.key)}
          />
        ))}
        <FilterOverviewRow
          label="Alle filtre"
          value={advancedFilterCount ? `${advancedFilterCount} aktive` : "Ingen"}
          onClick={() => openSection("attributes")}
        />
        <FilterOverviewRow
          label="Flere søkevalg"
          value={advancedSearchSummary || "Ingen"}
          onClick={() => openSection("search")}
        />
      </div>
    </div>
  );

  /** Selve seksjonene — delt mellom skuffens én-om-gangen-visning og
   * sidekolonnens alt-åpent-visning, så det finnes bare ett filtersett. */
  const sectionFields = (
    <>
      {showSection("location") && (
        <section data-section="location" className={`${sectionClass} space-y-4`}>
          <Label className={labelClass}>Sted</Label>
          <LocationPicker value={location} onChange={onLocationChange} autoFocus={false} />
          {locationActive && (
            <RadiusPicker
              value={location.radius}
              onChange={(r) => onLocationChange({ ...location, radius: r })}
            />
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
              bounds={priceBounds}
              value={{ min: v.min ?? undefined, max: v.max ?? undefined }}
              onChange={({ min, max }) =>
                setV((prev) => ({ ...prev, min: min ?? null, max: max ?? null }))
              }
            />
            <div className="grid grid-cols-3 gap-2">
              {[50_000, 100_000, 250_000]
                .filter((max) => max <= priceBounds.max)
                .map((max) => (
                  <Button
                    key={max}
                    type="button"
                    variant={v.max === max ? "default" : "outline"}
                    size="default"
                    className={expanded ? "px-1 text-xs" : "min-h-13 px-2 text-xs"}
                    disabled={v.min != null && max < v.min}
                    onClick={() => setV((previous) => ({ ...previous, max }))}
                    aria-label={`Inntil ${max.toLocaleString("nb-NO")}`}
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
              />
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
                includePrimary={includePrimary}
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
              onClick={() => !expanded && setCategoryOpen(true)}
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
                      ? "Skal ikke inneholde"
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

  /** Kategori og tilstand er egne ark i skuffen, men hører hjemme rett i
   * sidekolonnen — ingen grunn til å åpne en dialog for dem der. */
  const inlineCategoryAndConditions = (
    <>
      {/* Kategorivelgeren er høy (hovedkategori + underkategoriliste), så den
          står bare åpen så lenge ingen kategori er valgt. Etterpå holder en
          sammendragslinje med «Endre» — resten av filtrene er viktigere når
          kategorien først er satt. */}
      <section data-section="categories" className={`${sectionClass} space-y-3`}>
        {categoryEditOpen || !isCategorySelectionComplete(v.categories, categoryTree) ? (
          <>
            <CategoryPicker
              categories={categories}
              selected={v.categories}
              onChange={(slugs) => setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))}
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
      <section data-section="conditions" className={`${sectionClass} space-y-2`}>
        <Label className={labelClass}>Tilstand</Label>
        {conditionOptions.map((condition) => (
          <label key={condition.value} className="flex cursor-pointer items-center gap-3">
            <Checkbox
              checked={v.conditions.includes(condition.value)}
              onCheckedChange={(checked) =>
                setV((prev) => ({
                  ...prev,
                  conditions:
                    checked === true
                      ? [...prev.conditions, condition.value]
                      : prev.conditions.filter((entry) => entry !== condition.value),
                }))
              }
              id={`adv-condition-${condition.value}`}
            />
            <Label
              htmlFor={`adv-condition-${condition.value}`}
              className="cursor-pointer text-sm font-normal"
            >
              {condition.label}
            </Label>
          </label>
        ))}
      </section>
    </>
  );

  return (
    <>
      {expanded ? (
        <div className="@container space-y-1">
          {inlineCategoryAndConditions}
          {sectionFields}
        </div>
      ) : overviewOpen ? (
        overview
      ) : (
        <div className="@container flex-1 overflow-y-auto px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
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

      <NativeSheet
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        title="Velg kategori"
        titleVisible
        expandable
        className="overflow-y-auto"
      >
        <div className="mt-4">
          <CategoryPicker
            categories={categories}
            selected={v.categories}
            onChange={(slugs) => setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))}
            variant="icons"
          />
        </div>
        <Button type="button" className="mt-6 w-full" onClick={() => setCategoryOpen(false)}>
          Ferdig
        </Button>
      </NativeSheet>

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
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="native-touch-target flex min-h-14 w-full items-center gap-3 rounded-xl bg-muted px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{value}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function TermGroupSheet({
  group,
  onClose,
  onSave,
}: {
  group: TermGroup | null;
  onClose: () => void;
  onSave: (g: TermGroup) => void;
}) {
  if (!group) return null;
  return <OpenTermGroupSheet key={group.id} group={group} onClose={onClose} onSave={onSave} />;
}

function OpenTermGroupSheet({
  group,
  onClose,
  onSave,
}: {
  group: TermGroup;
  onClose: () => void;
  onSave: (g: TermGroup) => void;
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
      title="Flere søkevalg"
      titleVisible
      expandable
      className="overflow-y-auto"
    >
      <div className="mt-4">
        <TermGroupRow group={draft} onChange={updateDraft} />
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
