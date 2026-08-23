import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Search as SearchIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { RangeFilterField } from "@/components/range-filter-field";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import { LocationPicker, RadiusPicker } from "@/components/location-filter";
import { TermGroupEditor } from "@/components/term-group-editor";
import { ModeToggle, CategoryPicker } from "@/components/advanced-search-sheet";
import { CONDITIONS } from "@/components/advanced-search-value";
import { PRICE_BOUNDS } from "@/lib/filter-range-bounds";
import { searchSchema, conditionEnum } from "@/features/listing-search/search-schema";
import { z } from "zod";
import { useAnnonserSearchState } from "@/features/listing-search/use-annonser-search-state";
import { useFilterFacetCounts } from "@/features/listing-search/use-filter-facet-counts";
import {
  normalizeFilter,
  splitPrimaryFilters,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
} from "@/lib/category-filters";
import { resolveCategoryIds, type Category } from "@/lib/categories";

export const Route = createFileRoute("/annonser_/filter")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({ meta: [{ title: "Flere filter — Kaupet.no" }] }),
  component: FilterPage,
});

const SECTIONS = [
  { key: "grunndata", label: "Grunndata" },
  { key: "teknisk", label: "Teknisk" },
  { key: "utstyr", label: "Utstyr" },
  { key: "sok", label: "Søkevilkår og lokasjon" },
] as const;

function FilterPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/annonser/filter" });
  const [, setQDraft] = useState(search.q);
  const preciseActive = search.qMode === "any" || (search.extraGroups?.length ?? 0) > 0;

  const { data: categories } = useQuery({
    queryKey: ["categories", "with-color"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color, heading_font")
        .eq("is_hidden", false)
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: allFilters } = useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order, is_primary")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  const {
    location,
    effectiveCategories,
    attrFilters,
    attrValues,
    handleAttrValueChange,
    updateSearch,
    handleLocationChange,
  } = useAnnonserSearchState({ search, navigate, categories, allFilters, setQDraft });

  const { data: facetCounts } = useFilterFacetCounts({
    filters: attrFilters,
    values: attrValues,
    categoryIds: resolveCategoryIds(effectiveCategories, categories ?? []),
    conditions: search.conditions ?? [],
    min: search.min,
    max: search.max,
    includeFree: search.includeFree ?? true,
  });

  const { primary, secondary } = splitPrimaryFilters(attrFilters);
  const teknisk = secondary.filter((f) => !VEHICLE_EQUIPMENT_FILTER_KEYS.includes(f.key as never));
  const utstyr = secondary.filter((f) => VEHICLE_EQUIPMENT_FILTER_KEYS.includes(f.key as never));

  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].key);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Client-side nav from a longer page (e.g. /annonser's result list) keeps
  // the browser's scroll offset, landing this short page mid-way down.
  useEffect(() => window.scrollTo(0, 0), []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        setActiveSection(top.target.getAttribute("data-section") ?? SECTIONS[0].key);
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    for (const key of SECTIONS.map((s) => s.key)) {
      const el = sectionRefs.current[key];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // Teknisk/Utstyr sections only mount once their filters have loaded, so
    // the observer must re-attach once they appear in the DOM.
  }, [teknisk.length, utstyr.length]);

  const scrollTo = (key: string) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/annonser"
          search={(prev) => prev}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted"
          aria-label="Tilbake til annonser"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold">Flere filter</h1>
      </div>

      {/* Offset matches SiteHeader's actual height (h-16 + its .pt-safe
          padding + border, see styles.css) it would otherwise scroll under —
          both are sticky at the viewport top, so without this the nav ends
          up hidden behind it. */}
      <nav
        style={{ top: "calc(4rem + max(0.5rem, env(safe-area-inset-top)) + 1px)" }}
        className="sticky z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border bg-background px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => scrollTo(s.key)}
            className={
              activeSection === s.key
                ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "shrink-0 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="space-y-8">
        <Section
          sectionKey="grunndata"
          title="Grunndata"
          refCb={(el) => (sectionRefs.current.grunndata = el)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CategoryFilterFields
              filters={primary}
              brandLookupFilters={attrFilters}
              values={attrValues}
              onChange={handleAttrValueChange}
              counts={facetCounts}
            />
            <RangeFilterField
              label="Pris"
              bounds={PRICE_BOUNDS}
              value={{ min: search.min, max: search.max }}
              onChange={(v) => updateSearch({ min: v.min, max: v.max })}
            />
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={search.includeFree ?? true}
              onCheckedChange={(c) => updateSearch({ includeFree: c === true })}
            />
            Inkluder gratis-annonser
          </label>
          <div className="mt-4 space-y-2">
            <Label className="text-sm font-medium">Tilstand</Label>
            <div className="grid grid-cols-1 gap-1 rounded-md border border-border p-2 sm:grid-cols-2">
              {CONDITIONS.map((c) => (
                <label
                  key={c.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={(search.conditions ?? []).includes(
                      c.value as z.infer<typeof conditionEnum>,
                    )}
                    onCheckedChange={(checked) =>
                      updateSearch({
                        conditions: (checked
                          ? [...(search.conditions ?? []), c.value]
                          : (search.conditions ?? []).filter((v) => v !== c.value)) as z.infer<
                          typeof conditionEnum
                        >[],
                      })
                    }
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>

        {teknisk.length > 0 && (
          <Section
            sectionKey="teknisk"
            title="Teknisk"
            refCb={(el) => (sectionRefs.current.teknisk = el)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CategoryFilterFields
                filters={teknisk}
                brandLookupFilters={attrFilters}
                values={attrValues}
                onChange={handleAttrValueChange}
                counts={facetCounts}
              />
            </div>
          </Section>
        )}

        {utstyr.length > 0 && (
          <Section
            sectionKey="utstyr"
            title="Utstyr"
            refCb={(el) => (sectionRefs.current.utstyr = el)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CategoryFilterFields
                filters={utstyr}
                brandLookupFilters={attrFilters}
                values={attrValues}
                onChange={handleAttrValueChange}
                counts={facetCounts}
              />
            </div>
          </Section>
        )}

        <Section
          sectionKey="sok"
          title="Søkevilkår og lokasjon"
          refCb={(el) => (sectionRefs.current.sok = el)}
        >
          <div className="space-y-6">
            <Collapsible key={preciseActive ? "active" : "default"} defaultOpen={preciseActive}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="group gap-1 px-0 text-primary"
                >
                  Presist søk
                  <ChevronDown
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Søkeordmodus</Label>
                  <ModeToggle
                    value={search.qMode}
                    onChange={(m) => updateSearch({ qMode: m })}
                    labels={["Alle ord", "Minst ett"]}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Flere søkelinjer</Label>
                  <TermGroupEditor
                    groups={search.extraGroups ?? []}
                    onChange={(extraGroups) => updateSearch({ extraGroups })}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <CategoryPicker
              categories={categories ?? []}
              selected={effectiveCategories}
              onChange={(slugs) =>
                updateSearch({ categories: slugs, category: "", catMode: "any" })
              }
            />

            <div className="space-y-2">
              <Label className="text-sm font-medium">Lokasjon</Label>
              <div className="rounded-md border border-border p-1">
                <LocationPicker value={location} onChange={handleLocationChange} />
              </div>
              <div className="rounded-md border border-border p-1">
                <RadiusPicker
                  value={location.radius}
                  onChange={(r) => handleLocationChange({ ...location, radius: r })}
                  disabled={location.lat == null}
                />
              </div>
            </div>
          </div>
        </Section>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-border bg-background px-4 py-3">
        <Link to="/annonser" search={(prev) => prev} className="block">
          <Button type="button" className="w-full gap-1.5">
            <SearchIcon className="size-4" /> Vis annonser
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Section({
  sectionKey,
  title,
  refCb,
  children,
}: {
  sectionKey: string;
  title: string;
  refCb: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div ref={refCb} data-section={sectionKey} className="scroll-mt-32">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
