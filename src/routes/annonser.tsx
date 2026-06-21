import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Expand, Map as MapIcon, Save } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchBar } from "@/components/search-bar";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import { valueToCriteria, type AdvancedSearchValue } from "@/components/advanced-search-value";
import { AdvancedSearchPanel } from "@/components/advanced-search-panel";
import { ActiveFilters } from "@/components/active-filters";
import { SortControl } from "@/components/sort-control";
import type { LocationValue } from "@/components/location-filter";
import type { TermGroup } from "@/lib/term-groups";
import type { MapListing } from "@/components/listings-map";
import { FeaturedListingsSection } from "@/components/featured-listings-section";
import { reverseGeocode } from "@/lib/geocode";
import { saveLastSearchContext } from "@/lib/last-search-context";
import { summarizeCriteria } from "@/lib/saved-searches";
import { useAuth } from "@/lib/use-auth";

const ListingsMap = lazy(() =>
  import("@/components/listings-map").then((m) => ({ default: m.ListingsMap })),
);

const stringArray = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}, z.array(z.string()));

const conditionEnum = z.enum(["new", "like_new", "good", "acceptable", "for_parts"]);
const conditionArray = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}, z.array(conditionEnum));

function rowContainsTerm(
  l: { title: string | null; description: string | null; city: string | null },
  term: string,
): boolean {
  const needle = term.toLowerCase();
  return (
    !!l.title?.toLowerCase().includes(needle) ||
    !!l.description?.toLowerCase().includes(needle) ||
    !!l.city?.toLowerCase().includes(needle)
  );
}

const termGroupSchema = z.object({
  id: z.string(),
  mode: z.enum(["all", "any"]),
  exclude: z.boolean(),
  terms: z.array(z.string()),
});

const searchSchema = z.object({
  q: z.string().optional().default(""),
  qMode: z.enum(["all", "any"]).optional().default("all"),
  extraGroups: z.array(termGroupSchema).optional().default([]),
  category: z.string().optional().default(""),
  categories: stringArray.optional().default([]),
  catMode: z.enum(["all", "any"]).optional().default("any"),
  conditions: conditionArray.optional().default([]),
  includeFree: z.coerce.boolean().optional().default(true),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["new", "price_asc", "price_desc"]).optional().default("new"),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().min(1).max(100).optional(),
  loc: z.string().optional(),
});

export const Route = createFileRoute("/annonser")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Alle annonser — brukte ting til salgs i Norge | Kaupet.no" },
      {
        name: "description",
        content:
          "Søk og bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris, tilstand og lokasjon på Kaupet.no.",
      },
      { property: "og:title", content: "Alle annonser — Kaupet.no" },
      {
        property: "og:description",
        content:
          "Bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris og sted.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kaupet.no/annonser" },
      { name: "twitter:title", content: "Alle annonser — Kaupet.no" },
      {
        name: "twitter:description",
        content:
          "Bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris og sted.",
      },
    ],
    links: [{ rel: "canonical", href: "https://kaupet.no/annonser" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Alle annonser på Kaupet.no",
          description:
            "Brukte ting til salgs i Norge. Søkbar katalog med filtre for kategori, pris, tilstand og lokasjon.",
          url: "https://kaupet.no/annonser",
          inLanguage: "nb-NO",
          isPartOf: { "@id": "https://kaupet.no/#website" },
        }),
      },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/annonser" });
  const { user } = useAuth();
  const [qDraft, setQDraft] = useState(search.q);
  const [mounted, setMounted] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [bigMapOpen, setBigMapOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  useEffect(() => setQDraft(search.q), [search.q]);

  const location: LocationValue = useMemo(
    () => ({
      lat: search.lat ?? null,
      lng: search.lng ?? null,
      radius: search.radius ?? 10,
      label: search.loc ?? "",
    }),
    [search.lat, search.lng, search.radius, search.loc],
  );

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return data;
    },
  });

  const { data: radiusIds } = useQuery({
    queryKey: ["listings-radius", search.lat, search.lng, search.radius],
    enabled: search.lat != null && search.lng != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listings_within_radius", {
        center_lat: search.lat!,
        center_lng: search.lng!,
        radius_km: search.radius ?? 10,
      });
      if (error) throw error;
      return (data ?? []).map((r: { id: string }) => r.id);
    },
  });

  // Merge legacy single `category` into `categories`
  const effectiveCategories = useMemo(() => {
    const arr = Array.isArray(search.categories) ? search.categories : [];
    if (search.category && !arr.includes(search.category)) return [...arr, search.category];
    return arr;
  }, [search.categories, search.category]);

  // Build terms list from `q` (space-separated)
  const terms = useMemo<string[]>(() => {
    const q: string = search.q ?? "";
    return q
      .trim()
      .split(/\s+/)
      .map((t: string) => t.replace(/[%_,()]/g, " ").trim())
      .filter(Boolean);
  }, [search.q]);

  const advancedInitial: AdvancedSearchValue = useMemo(
    () => ({
      terms,
      qMode: search.qMode ?? "all",
      extraGroups: search.extraGroups ?? [],
      categories: effectiveCategories,
      catMode: search.catMode ?? "any",
      conditions: search.conditions ?? [],
      min: typeof search.min === "number" ? search.min : null,
      max: typeof search.max === "number" ? search.max : null,
      includeFree: search.includeFree ?? true,
      sort: search.sort,
      location: {
        lat: search.lat ?? null,
        lng: search.lng ?? null,
        radius: search.radius ?? 10,
        label: search.loc ?? "",
      },
    }),
    [
      terms,
      search.qMode,
      search.extraGroups,
      effectiveCategories,
      search.catMode,
      search.conditions,
      search.min,
      search.max,
      search.includeFree,
      search.sort,
      search.lat,
      search.lng,
      search.radius,
      search.loc,
    ],
  );

  const currentCriteria = useMemo(
    () => ({ ...valueToCriteria(advancedInitial), sort: search.sort }),
    [advancedInitial, search.sort],
  );

  useEffect(() => {
    if (!mounted) return;
    const categoryNames = effectiveCategories
      .map((slug: string) => categories?.find((c) => c.slug === slug)?.name_nb)
      .filter((n: string | undefined): n is string => !!n);
    let label = "annonser";
    if (search.q) {
      label = `søket «${search.q}»`;
    } else if (categoryNames.length === 1) {
      label = categoryNames[0];
    } else if (categoryNames.length > 1) {
      label = "valgte kategorier";
    }
    saveLastSearchContext({ search, label });
  }, [mounted, search, effectiveCategories, categories]);

  const { data: listings, isLoading } = useQuery({
    queryKey: ["listings", search, radiusIds, effectiveCategories, terms],
    enabled:
      (effectiveCategories.length === 0 || !!categories) &&
      (search.lat == null || search.lng == null || radiusIds != null),
    queryFn: async () => {
      const extraGroups = search.extraGroups ?? [];
      const includeGroups = [
        { mode: search.qMode ?? "all", terms },
        ...extraGroups.filter((g) => !g.exclude),
      ];
      const excludeAnyGroups = extraGroups.filter((g) => g.exclude && g.mode === "any");
      const excludeAllGroups = extraGroups.filter((g) => g.exclude && g.mode === "all");
      // "exclude if ALL words present" needs a row-level AND-then-negate that
      // PostgREST/supabase-js can't express via chained filters, so it's
      // applied client-side below — fetch a larger buffer to compensate for
      // rows trimmed after that pass.
      const needsClientExclude = excludeAllGroups.length > 0;

      let qb = supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, description, price_nok, is_free, city, display_lat, display_lng, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active");

      if (search.lat != null && search.lng != null) {
        const ids = radiusIds ?? [];
        if (ids.length === 0) return [];
        qb = qb.in("id", ids);
      }

      // Include groups: AND between groups (each chained .or() call is ANDed
      // by PostgREST), OR within a group's own words ("any") or AND of
      // per-word .or() calls within a group ("all").
      for (const g of includeGroups) {
        if (g.terms.length === 0) continue;
        if (g.mode === "all") {
          for (const term of g.terms) {
            const p = `%${term}%`;
            qb = qb.or(`title.ilike.${p},description.ilike.${p},city.ilike.${p}`);
          }
        } else {
          const parts = g.terms.flatMap((t: string) => {
            const p = `%${t}%`;
            return [`title.ilike.${p}`, `description.ilike.${p}`, `city.ilike.${p}`];
          });
          qb = qb.or(parts.join(","));
        }
      }

      // Exclude groups (mode "any"): exclude rows where any word matches any
      // field — AND of NOT-ilike per (word × field), chainable directly.
      for (const g of excludeAnyGroups) {
        for (const term of g.terms) {
          const p = `%${term}%`;
          qb = qb.not("title", "ilike", p).not("description", "ilike", p).not("city", "ilike", p);
        }
      }

      // Categories — single selection; if a parent is chosen, include all children
      if (effectiveCategories.length > 0 && categories) {
        const selectedSlugs = new Set(effectiveCategories);
        const selectedCats = categories.filter((c) => selectedSlugs.has(c.slug));
        const ids = new Set<string>();
        for (const c of selectedCats) {
          ids.add(c.id);
          if (c.parent_id == null) {
            for (const child of categories) {
              if (child.parent_id === c.id) ids.add(child.id);
            }
          }
        }
        if (ids.size === 0) return [];
        qb = qb.in("category_id", Array.from(ids));
      }

      // Conditions
      if (search.conditions && search.conditions.length > 0) {
        qb = qb.in("condition", search.conditions);
      }

      // Price
      const includeFree = search.includeFree ?? true;
      if (!includeFree) qb = qb.eq("is_free", false);
      if (typeof search.min === "number") {
        if (includeFree) {
          qb = qb.or(`is_free.eq.true,price_nok.gte.${search.min}`);
        } else {
          qb = qb.gte("price_nok", search.min);
        }
      }
      if (typeof search.max === "number") {
        if (includeFree) {
          qb = qb.or(`is_free.eq.true,price_nok.lte.${search.max}`);
        } else {
          qb = qb.lte("price_nok", search.max);
        }
      }

      if (search.sort === "price_asc")
        qb = qb.order("price_nok", { ascending: true, nullsFirst: false });
      else if (search.sort === "price_desc")
        qb = qb.order("price_nok", { ascending: false, nullsFirst: false });
      else qb = qb.order("created_at", { ascending: false });

      const { data, error } = await qb.limit(needsClientExclude ? 200 : 60);
      if (error) throw error;

      let rows = data ?? [];
      if (needsClientExclude) {
        rows = rows.filter(
          (l) =>
            !excludeAllGroups.some(
              (g) => g.terms.length > 0 && g.terms.every((t) => rowContainsTerm(l, t)),
            ),
        );
        rows = rows.slice(0, 60);
      }

      return rows.map((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          lat: l.display_lat as number | null,
          lng: l.display_lng as number | null,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
  });

  const updateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });
  };

  // Applies only the fields owned by the advanced panel (category, price,
  // condition, extra search lines). Query text, qMode, location and sort are
  // owned by the search bar and already applied directly to the URL as the
  // user edits them, so re-patching them here from the panel's draft would
  // clobber any bar edits made while the panel was open.
  const handleApply = (v: AdvancedSearchValue) => {
    const c = valueToCriteria(v);
    updateSearch({
      extraGroups: c.extraGroups,
      categories: c.categories,
      catMode: c.catMode,
      conditions: c.conditions as z.infer<typeof conditionEnum>[] | undefined,
      includeFree: c.includeFree,
      min: c.min ?? undefined,
      max: c.max ?? undefined,
      category: "",
    });
  };

  const handleLocationChange = (v: LocationValue) => {
    updateSearch({
      lat: v.lat ?? undefined,
      lng: v.lng ?? undefined,
      radius: v.lat != null ? v.radius : undefined,
      loc: v.label || undefined,
    });
  };

  const resetFilters = () => {
    navigate({ search: () => ({ q: "", category: "", sort: "new" }) });
    setQDraft("");
  };

  const cards: ListingCardData[] = (listings ?? []).map((l) => ({
    id: l.id,
    kaupet_code: l.kaupet_code,
    title: l.title,
    price_nok: l.price_nok,
    is_free: l.is_free,
    city: l.city,
    created_at: l.created_at,
    cover_path: l.cover_path,
  }));

  const mapListings: MapListing[] = (listings ?? [])
    .filter((l): l is typeof l & { lat: number; lng: number } => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id,
      kaupet_code: l.kaupet_code,
      title: l.title,
      price_nok: l.price_nok,
      is_free: l.is_free,
      lat: l.lat,
      lng: l.lng,
      cover_path: l.cover_path,
    }));

  const mapCenter =
    search.lat != null && search.lng != null ? { lat: search.lat, lng: search.lng } : null;

  const renderMap = (withAreaSearch: boolean) =>
    mounted ? (
      <Suspense fallback={<div className="h-full w-full animate-pulse rounded-2xl bg-muted" />}>
        <ListingsMap
          center={mapCenter}
          radiusKm={search.radius ?? 10}
          listings={mapListings}
          hoveredId={hoveredId}
          activeId={activeId}
          onMarkerHover={setHoveredId}
          onMarkerSelect={setActiveId}
          onCenterChange={(c) => {
            updateSearch({
              lat: c.lat,
              lng: c.lng,
              radius: search.radius ?? 10,
              loc: "Henter sted…",
            });
            void reverseGeocode(c).then((name) => {
              updateSearch({
                lat: c.lat,
                lng: c.lng,
                radius: search.radius ?? 10,
                loc: name ?? "Valgt punkt",
              });
            });
          }}
          onAreaSearch={
            withAreaSearch
              ? (c) => {
                  updateSearch({
                    lat: c.lat,
                    lng: c.lng,
                    radius: search.radius ?? 10,
                    loc: "Henter sted…",
                  });
                  void reverseGeocode(c).then((name) => {
                    updateSearch({
                      lat: c.lat,
                      lng: c.lng,
                      radius: search.radius ?? 10,
                      loc: name ?? "Valgt punkt",
                    });
                  });
                }
              : undefined
          }
          className="h-full w-full"
        />
      </Suspense>
    ) : (
      <div className="h-full w-full animate-pulse rounded-2xl bg-muted" />
    );

  if (!mounted) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10" aria-busy="true" aria-live="polite">
        <h1 className="font-display text-3xl tracking-tight">Annonser</h1>
        <span className="sr-only">Laster…</span>
        <div className="mt-6 h-14 w-full animate-pulse rounded-full bg-muted" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border p-3">
                <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-24 h-[calc(100vh-8rem)] w-full animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-10">
      <h1 className="font-display text-3xl tracking-tight">Annonser</h1>

      <div className="mt-6 space-y-2">
        <SearchBar
          q={qDraft}
          onQChange={setQDraft}
          onSubmitQ={() => updateSearch({ q: qDraft })}
          location={location}
          onLocationChange={handleLocationChange}
          selectedSlugs={
            search.category
              ? [search.category, ...search.categories.filter((s: string) => s !== search.category)]
              : search.categories
          }
          onSelectedChange={(slugs) =>
            updateSearch({ category: "", categories: slugs, catMode: "any" })
          }
          categories={categories ?? []}
          hideCategory={advOpen}
          qMode={search.qMode}
          onQModeChange={(m) => updateSearch({ qMode: m })}
          showQMode={advOpen}
        />
        <AdvancedSearchPanel
          open={advOpen}
          onOpenChange={setAdvOpen}
          initial={advancedInitial}
          categories={categories ?? []}
          onApply={handleApply}
          sortControl={
            <SortControl sort={search.sort} onSortChange={(s) => updateSearch({ sort: s })} />
          }
        />
      </div>

      <ActiveFilters
        search={search}
        categories={categories ?? []}
        terms={terms}
        effectiveCategories={effectiveCategories}
        onUpdate={(patch) =>
          updateSearch({
            ...patch,
            conditions: patch.conditions as z.infer<typeof conditionEnum>[] | undefined,
          })
        }
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {isLoading ? "Søker…" : `${cards.length} annonse${cards.length === 1 ? "" : "r"}`}
        </span>
        <div className="flex items-center gap-2">
          {!isDesktop && (
            <Sheet open={mobileMapOpen} onOpenChange={setMobileMapOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <MapIcon className="size-4" /> Kart
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[88vh] p-4">
                <SheetHeader>
                  <SheetTitle>Kart</SheetTitle>
                </SheetHeader>
                <div className="mt-3 h-[calc(100%-3rem)]">
                  {mobileMapOpen ? renderMap(true) : null}
                </div>
              </SheetContent>
            </Sheet>
          )}
          {user && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSaveSearchOpen(true)}
              className="gap-1.5"
            >
              <Save className="size-4" /> Lagre søk
            </Button>
          )}
        </div>
      </div>

      {user && (
        <SaveSearchDialog
          open={saveSearchOpen}
          onOpenChange={setSaveSearchOpen}
          defaultName={summarizeCriteria(currentCriteria)}
          criteria={currentCriteria}
          onSaved={() => setSaveSearchOpen(false)}
        />
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div>
          {!isLoading && (
            <FeaturedListingsSection
              categorySlug={effectiveCategories.length === 1 ? effectiveCategories[0] : undefined}
              allowedIds={new Set((listings ?? []).map((l) => l.id))}
              limit={3}
            />
          )}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="aspect-[4/3] bg-muted" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-4/5 rounded bg-muted" />
                    <div className="h-4 w-1/3 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
              <p className="text-lg font-medium">Ingen annonser funnet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Prøv et bredere søk eller øk radiusen.
              </p>
              <Button variant="outline" className="mt-4" onClick={resetFilters}>
                Nullstill filtre
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {cards.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  highlighted={hoveredId === l.id || activeId === l.id}
                  onHoverChange={setHoveredId}
                />
              ))}
            </div>
          )}
        </div>

        {isDesktop && (
          <aside>
            <div className="sticky top-20 h-[calc(100vh-6rem)]">
              <div className="relative h-full overflow-hidden rounded-2xl border border-border shadow-sm">
                {renderMap(true)}
                <Dialog open={bigMapOpen} onOpenChange={setBigMapOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="absolute right-3 top-3 z-[450] rounded-full shadow-md"
                    >
                      <Expand className="size-4" /> Utvid
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] p-0 sm:max-w-[95vw]">
                    <DialogHeader className="px-4 pt-4">
                      <DialogTitle>Kart</DialogTitle>
                    </DialogHeader>
                    <div className="h-[85vh] w-full p-4 pt-2">
                      {bigMapOpen ? renderMap(true) : null}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
