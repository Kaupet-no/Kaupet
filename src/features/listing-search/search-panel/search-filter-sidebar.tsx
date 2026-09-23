import { useLayoutEffect, useRef, useState } from "react";
import { LayoutGrid, ListFilter, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeAttrValue } from "@/components/active-filters";
import { cn } from "@/lib/utils";
import {
  conditionOptionsFor,
  defaultAdvancedSearchValue,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import type { AttributeFilterValue } from "@/lib/category-filters";
import { priceBoundsForMax } from "@/lib/filter-range-bounds";
import { trackProductEvent } from "@/lib/product-analytics";
import { SearchFilterSections } from "./filter-sections";
import type { SearchPanelResultsContext } from "./search-panel";

type Props = {
  results: SearchPanelResultsContext;
  categories: Category[];
  /** «Lagre søk» — utelates for utloggede brukere. */
  onSaveSearch?: () => void;
  /** "sidebar" er desktops sticky sidekolonne. "inline" er samme innhold uten
   * kolonne-chrome, til bruk inne i mobilwebens filterdialog — se
   * `SearchPanel`, som gir den et utkast i stedet for anvendt state. */
  variant?: "sidebar" | "inline";
  className?: string;
};

/**
 * Hele filtersettet i nettleseren — permanent sidekolonne på desktop
 * (`variant="sidebar"`), og nøyaktig det samme innholdet inne i mobilwebens
 * filterdialog (`variant="inline"`). Én komponent, så de to bredene ikke kan
 * drifte fra hverandre.
 *
 * `results.applied`/`onApply` er anvendt søk i sidekolonnen (hvert valg
 * gjelder umiddelbart) og dialogens utkast i `inline` (der «Vis N annonser»
 * committer). Begge bruker de samme feltseksjonene; bare desktop grupperer dem.
 */
export function SearchFilterSidebar({
  results,
  categories,
  onSaveSearch,
  variant = "sidebar",
  className,
}: Props) {
  const { applied, onApply } = results;
  const [group, setGroup] = useState<"basis" | "details" | "more">("basis");

  const setValue = (next: React.SetStateAction<AdvancedSearchValue>) => {
    const value = typeof next === "function" ? next(applied.value) : next;
    onApply({
      value,
      attributes:
        value.categories.join("\0") === applied.value.categories.join("\0")
          ? applied.attributes
          : {},
    });
  };

  const onAttributeChange = (key: string, value: AttributeFilterValue | undefined) => {
    const attributes = { ...applied.attributes };
    if (value === undefined) delete attributes[key];
    else attributes[key] = value;
    onApply({ ...applied, attributes });
  };
  const priceBounds = priceBoundsForMax(results.availablePriceMax, {
    min: applied.value.min ?? undefined,
    max: applied.value.max ?? undefined,
  });

  const activeCount =
    Object.keys(applied.attributes).length +
    applied.value.categories.length +
    applied.value.conditions.length +
    (applied.value.min != null || applied.value.max != null ? 1 : 0) +
    (applied.value.location.lat != null ? 1 : 0) +
    applied.value.extraGroups.length;

  const inline = variant === "inline";
  const Root = inline ? "div" : "aside";
  const sidebarRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (inline || !sidebarRef.current) return;
    const sidebar = sidebarRef.current;
    const updateHeight = () => {
      const top = Math.max(
        sidebar.getBoundingClientRect().top,
        parseFloat(getComputedStyle(sidebar).top) || 0,
      );
      const bottom = Math.min(
        window.innerHeight,
        sidebar.parentElement?.getBoundingClientRect().bottom ?? window.innerHeight,
      );
      sidebar.style.maxHeight = `${Math.max(0, bottom - top - 12)}px`;
    };
    updateHeight();
    window.addEventListener("scroll", updateHeight, { passive: true });
    window.addEventListener("resize", updateHeight);
    const observer = new ResizeObserver(updateHeight);
    if (sidebar.parentElement) observer.observe(sidebar.parentElement);
    return () => {
      window.removeEventListener("scroll", updateHeight);
      window.removeEventListener("resize", updateHeight);
      observer.disconnect();
    };
  }, [inline]);
  const selectedCategories = categories.filter((category) =>
    applied.value.categories.includes(category.slug),
  );
  const categoryLabel =
    selectedCategories.length > 1
      ? `${selectedCategories[0].name_nb} +${selectedCategories.length - 1}`
      : (selectedCategories[0]?.name_nb ?? applied.value.categories[0] ?? "Kategori");
  const summary: { key: string; label: string; onRemove?: () => void }[] = [];

  if (applied.value.terms.length) {
    summary.push({
      key: "query",
      label: `Søk: ${applied.value.terms.join(" ")}`,
      onRemove: () => setValue((value) => ({ ...value, terms: [] })),
    });
  }
  if (applied.value.categories.length) {
    summary.push({
      key: "category",
      label: categoryLabel,
      onRemove: results.categoryLocked
        ? undefined
        : () =>
            onApply({
              value: { ...applied.value, categories: [], catMode: "any" },
              attributes: {},
            }),
    });
  }
  if (applied.value.location.lat != null) {
    summary.push({
      key: "location",
      label: `${applied.value.location.label || "Valgt sted"} · ${applied.value.location.radius} km`,
      onRemove: () =>
        setValue((value) => ({
          ...value,
          location: { ...value.location, lat: null, lng: null, label: "" },
        })),
    });
  }
  if (applied.value.min != null || applied.value.max != null) {
    const min = applied.value.min?.toLocaleString("nb-NO");
    const max = applied.value.max?.toLocaleString("nb-NO");
    summary.push({
      key: "price",
      label: min && max ? `${min}–${max} kr` : min ? `Fra ${min} kr` : `Maks ${max} kr`,
      onRemove: () => setValue((value) => ({ ...value, min: null, max: null })),
    });
  }
  if (!applied.value.includeFree) {
    summary.push({
      key: "free",
      label: "Uten gratisannonser",
      onRemove: () => setValue((value) => ({ ...value, includeFree: true })),
    });
  }
  for (const condition of applied.value.conditions) {
    summary.push({
      key: `condition:${condition}`,
      label:
        conditionOptionsFor(applied.value.categories).find((option) => option.value === condition)
          ?.label ?? condition,
      onRemove: () =>
        setValue((value) => ({
          ...value,
          conditions: value.conditions.filter((entry) => entry !== condition),
        })),
    });
  }
  for (const [key, value] of Object.entries(applied.attributes)) {
    const filter = results.attributeFilters?.find((entry) => entry.key === key);
    const label = filter?.label_nb ?? key;
    const detail =
      value.kind === "multiselect" || value.kind === "exclude"
        ? value.values
            .map(
              (entry) =>
                filter?.options?.find((option) => option.value === entry)?.label_nb ?? entry,
            )
            .join(", ")
        : filter && value.kind !== "boolean"
          ? describeAttrValue(filter, value)
          : "";
    summary.push({
      key: `attribute:${key}`,
      label: detail ? `${label}: ${detail}` : label,
      onRemove: () => onAttributeChange(key, undefined),
    });
  }
  if (applied.value.qMode === "any") {
    summary.push({
      key: "mode",
      label: "Minst ett ord",
      onRemove: () => setValue((value) => ({ ...value, qMode: "all" })),
    });
  }
  for (const rule of applied.value.extraGroups) {
    summary.push({
      key: `rule:${rule.id}`,
      label: `${rule.exclude ? "Uten" : "Med"} ${rule.terms.join(", ")}`,
      onRemove: () =>
        setValue((value) => ({
          ...value,
          extraGroups: value.extraGroups.filter((entry) => entry.id !== rule.id),
        })),
    });
  }
  const canReset = inline
    ? activeCount > 0
    : summary.some(
        (item) =>
          item.onRemove &&
          item.key !== "query" &&
          item.key !== "mode" &&
          !item.key.startsWith("rule:"),
      );

  return (
    <Root
      ref={(node) => {
        sidebarRef.current = node;
      }}
      aria-label={inline ? undefined : "Filtrer annonser"}
      data-testid={inline ? undefined : "search-filter-sidebar"}
      className={cn(
        inline
          ? "min-h-0 flex-1 overflow-y-auto"
          : "sticky top-[calc(var(--site-header-h)+0.75rem)] hidden max-h-[calc(100dvh-var(--site-header-h)-1.5rem)] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:flex",
        className,
      )}
    >
      <div className={inline ? undefined : "flex min-h-0 flex-1 flex-col"}>
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-5 pb-2 pt-5",
            !inline && "shrink-0",
          )}
        >
          <h2 className={inline ? "font-display text-xl tracking-tight" : "text-sm font-semibold"}>
            Filtre{inline && activeCount > 0 ? ` · ${activeCount}` : ""}
          </h2>
          {canReset && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground"
              onClick={() => {
                trackProductEvent("search_filter_applied", {
                  section: "categories",
                  filterCount: 0,
                  resultCount: null,
                });
                onApply({
                  value: {
                    ...defaultAdvancedSearchValue(),
                    terms: inline ? [] : applied.value.terms,
                    qMode: inline ? "all" : applied.value.qMode,
                    extraGroups: inline ? [] : applied.value.extraGroups,
                    categories: results.categoryLocked ? applied.value.categories : [],
                  },
                  attributes: {},
                });
              }}
            >
              <RotateCcw className="size-3.5" />
              Nullstill
            </Button>
          )}
        </div>

        {!inline && (
          <div className="mx-5 mb-4 shrink-0 rounded-xl bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2 text-xs font-medium">
              <span>Søket ditt</span>
              <span className="text-muted-foreground">{summary.length} aktive</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Aktive filtre">
              {summary.length ? (
                summary.map((item) =>
                  item.onRemove ? (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onRemove}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-left text-xs hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Fjern ${item.label}`}
                    >
                      <span className="min-w-0 break-words">{item.label}</span>
                      <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  ) : (
                    <span
                      key={item.key}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                    >
                      {item.label}
                    </span>
                  ),
                )
              ) : (
                <span className="text-xs text-muted-foreground">Ingen filtre valgt</span>
              )}
            </div>
          </div>
        )}

        <Tabs
          value={group}
          onValueChange={(next) => setGroup(next as typeof group)}
          className={inline ? undefined : "flex min-h-0 flex-1 flex-col"}
        >
          {!inline && (
            <TabsList
              className="grid h-auto w-full shrink-0 grid-cols-3 gap-1 rounded-none border-b border-border bg-transparent px-4 pb-2"
              aria-label="Filtergrupper"
            >
              {(
                [
                  ["basis", "Basis", SlidersHorizontal],
                  ["details", "Detaljer", LayoutGrid],
                  ["more", "Mer", ListFilter],
                ] as const
              ).map(([key, label, Icon]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex min-h-9 items-center justify-center gap-1 rounded-md px-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          <TabsContent
            key={group}
            value={group}
            className={cn(
              "mt-0 px-5 pb-5 pt-4",
              !inline && "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            )}
          >
            <SearchFilterSections
              layout="expanded"
              desktopGroup={inline ? undefined : group}
              value={applied.value}
              setValue={setValue}
              categories={categories}
              section="categories"
              queryText={applied.value.terms.join(" ")}
              attributeFilters={results.attributeFilters}
              attributeValues={applied.attributes}
              onAttributeChange={onAttributeChange}
              attributeCounts={results.attributeCounts}
              priceBounds={priceBounds}
              includePrimary
              hideCategory={results.categoryLocked}
              hideSearchOptions={!inline}
            />
          </TabsContent>
        </Tabs>
      </div>
      {onSaveSearch && (
        <div className={inline ? "px-5 pb-5" : "shrink-0 border-t border-border bg-card px-5 py-3"}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={onSaveSearch}
          >
            <Save className="size-4" /> Lagre søk
          </Button>
        </div>
      )}
    </Root>
  );
}
