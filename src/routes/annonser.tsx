import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Expand, Map as MapIcon, Save, SlidersHorizontal } from "lucide-react";
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
import {
  AdvancedSearchSheet,
  SaveSearchDialog,
  valueToCriteria,
  type AdvancedSearchValue,
} from "@/components/advanced-search-sheet";
import type { LocationValue } from "@/components/location-filter";
import type { MapListing } from "@/components/listings-map";
import { FeaturedListingsSection } from "@/components/featured-listings-section";
import { reverseGeocode } from "@/lib/geocode";
import { saveLastSearchContext } from "@/lib/last-search-context";
import { summarizeCriteria } from "@/lib/saved-searches";
import { useAuth } from "@/lib/auth";

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

const searchSchema = z.object({
  q: z.string().optional().default(""),
  qMode: z.enum(["all", "any"]).optional().default("all"),
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
      categories: effectiveCategories,
      catMode: search.catMode ?? "any",
      conditions: search.conditions ?? [],
      min: typeof search.min === "number" ? search.min : null,
      max: typeof search.max === "number" ? search.max : null,
      includeFree: search.includeFree ?? true,
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
      effectiveCategories,
      search.catMode,
      search.conditions,
      search.min,
      search.max,
      search.includeFree,
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

  const advancedFilterCount =
    (effectiveCategories.length > 0 ? 1 : 0) +
    ((search.conditions?.length ?? 0) > 0 ? 1 : 0) +
    (typeof search.min === "number" || typeof search.max === "number" ? 1 : 0) +
    (search.lat != null && search.lng != null ? 1 : 0) +
    (search.includeFree === false ? 1 : 0);

  const { data: listings, isLoading } = useQuery({
    queryKey: ["listings", search, radiusIds, effectiveCategories, terms],
    enabled:
      (effectiveCategories.length === 0 || !!categories) &&
      (search.lat == null || search.lng == null || radiusIds != null),
    queryFn: async () => {
      let qb = supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, price_nok, is_free, city, lat, lng, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active");

      if (search.lat != null && search.lng != null) {
        const ids = radiusIds ?? [];
        if (ids.length === 0) return [];
        qb = qb.in("id", ids);
      }

      // Search terms with AND/OR logic
      if (terms.length > 0) {
        const qMode = search.qMode ?? "all";
        if (qMode === "all") {
          for (const term of terms) {
            const p = `%${term}%`;
            qb = qb.or(`title.ilike.${p},description.ilike.${p},city.ilike.${p}`);
          }
        } else {
          const parts = terms.flatMap((t: string) => {
            const p = `%${t}%`;
            return [`title.ilike.${p}`, `description.ilike.${p}`, `city.ilike.${p}`];
          });
          qb = qb.or(parts.join(","));
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

      const { data, error } = await qb.limit(60);
      if (error) throw error;
      return (data ?? []).map((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          lat: l.lat as number | null,
          lng: l.lng as number | null,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
  });

  const updateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });
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

      <div className="mt-6">
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
          sort={search.sort}
          onSortChange={(s) => updateSearch({ sort: s })}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-sm text-muted-foreground">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdvOpen(true)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="size-4" /> Avansert søk
            {advancedFilterCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
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

      <AdvancedSearchSheet
        open={advOpen}
        onOpenChange={setAdvOpen}
        initial={advancedInitial}
        categories={categories ?? []}
        currentSort={search.sort}
        onApply={(v) => {
          const c = valueToCriteria(v);
          navigate({
            search: (prev: z.infer<typeof searchSchema>) => ({
              ...prev,
              q: (c.terms ?? []).join(" "),
              qMode: c.qMode,
              categories: c.categories,
              catMode: c.catMode,
              conditions: c.conditions,
              includeFree: c.includeFree,
              min: c.min ?? undefined,
              max: c.max ?? undefined,
              lat: c.lat ?? undefined,
              lng: c.lng ?? undefined,
              radius: c.radius ?? undefined,
              loc: c.loc,
              category: "",
            }),
          });
        }}
      />

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
