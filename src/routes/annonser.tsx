import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Expand, LayoutList, LayoutGrid, Map as MapIcon, Save } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

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
import { NativeFilterChips } from "@/components/native-filter-chips";
import { NativeSearchOverlay } from "@/components/native-search-overlay";
import { NativeAdvancedSearch } from "@/components/native-advanced-search";
import { reverseGeocode } from "@/lib/geocode";
import { saveLastSearchContext } from "@/lib/last-search-context";
import { summarizeCriteria } from "@/lib/saved-searches";
import {
  countWtbListings,
  listWtbListings,
  type WtbListingWithProfile,
} from "@/lib/wtb-listings.functions";
import { WtbListingCard } from "@/components/wtb-listing-card";
import { useAuth } from "@/lib/use-auth";
import { useIsNative } from "@/lib/use-is-native";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { useScrollDirection } from "@/lib/use-scroll-direction";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";

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
  const isNative = useIsNative();
  const scrollDir = useScrollDirection();
  const queryClient = useQueryClient();
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
  const [loadedPages, setLoadedPages] = useState(1);
  const PAGE_SIZE = 20;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [advancedOverlayOpen, setAdvancedOverlayOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"listings" | "wtb">("listings");

  const { refreshing, pullDistance } = usePullToRefresh({
    enabled: isNative && mounted,
    onRefresh: async () => {
      setLoadedPages(1);
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
  });
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem("kaupet_view_mode") as "grid" | "list") ?? "grid";
    } catch {
      return "grid";
    }
  });

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  useEffect(() => setQDraft(search.q), [search.q]);
  useEffect(
    () => setLoadedPages(1),
    [
      search.q,
      search.category,
      search.categories,
      search.conditions,
      search.min,
      search.max,
      search.sort,
      search.lat,
      search.lng,
    ],
  );

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
    queryKey: ["listings", search, radiusIds, effectiveCategories, terms, loadedPages],
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

      const limit = PAGE_SIZE * loadedPages;
      const { data, error } = await qb.limit(needsClientExclude ? limit * 4 : limit);
      if (error) throw error;

      let rows = data ?? [];
      if (needsClientExclude) {
        rows = rows.filter(
          (l) =>
            !excludeAllGroups.some(
              (g) => g.terms.length > 0 && g.terms.every((t) => rowContainsTerm(l, t)),
            ),
        );
        rows = rows.slice(0, PAGE_SIZE * loadedPages);
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

  const countWtbFn = useServerFn(countWtbListings);
  const listWtbFn = useServerFn(listWtbListings);

  const wtbQueryParams = useMemo(
    () => ({
      q: search.q || undefined,
      categories: effectiveCategories.length
        ? effectiveCategories
            .map((slug: string) => categories?.find((c) => c.slug === slug)?.id)
            .filter((id): id is string => !!id)
        : undefined,
    }),
    [search.q, effectiveCategories, categories],
  );

  const hasSearchCriteria = !!(search.q || effectiveCategories.length);

  const { data: wtbCount = 0 } = useQuery({
    queryKey: ["wtb-count", wtbQueryParams],
    enabled: hasSearchCriteria,
    staleTime: 60_000,
    queryFn: () => countWtbFn({ data: wtbQueryParams }),
  });

  const { data: wtbResult } = useQuery({
    queryKey: ["wtb-list", wtbQueryParams],
    enabled: activeTab === "wtb" && hasSearchCriteria,
    staleTime: 60_000,
    queryFn: () => listWtbFn({ data: { ...wtbQueryParams, limit: 50, offset: 0 } }),
  });

  const wtbListings: WtbListingWithProfile[] = wtbResult?.rows ?? [];

  // Reset to listings tab when search criteria change
  useEffect(() => {
    setActiveTab("listings");
  }, [search.q, search.category, search.categories]);

  const updateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });
  };

  // Applies only the fields owned by the advanced panel (category, price,
  // condition, extra search lines). Query text, qMode, location and sort are
  // owned by the search bar and already applied directly to the URL as the
  // user edits them, so re-patching them here from the panel's draft would
  // clobber any bar edits made while the panel was open.
  const handleApply = (v: AdvancedSearchValue) => {
    void hapticNotification("success");
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

  // Native infinite scroll — load next page when sentinel enters viewport
  useEffect(() => {
    if (!isNative || !sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoading && cards.length >= PAGE_SIZE * loadedPages) {
          setLoadedPages((p) => p + 1);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isNative, isLoading, cards.length, loadedPages]);

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
    <div className={`mx-auto max-w-7xl px-4 ${isNative ? "pt-2 pb-8" : "py-8 md:py-10"}`}>
      {isNative && (pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-150"
          style={{ height: refreshing ? 48 : Math.min(pullDistance, 48) }}
        >
          <div
            className={`size-6 rounded-full border-2 border-primary border-t-transparent ${refreshing ? "animate-spin" : ""}`}
            style={{ opacity: refreshing ? 1 : pullDistance / 64 }}
          />
        </div>
      )}
      {!isNative && <h1 className="font-display text-3xl tracking-tight">Annonser</h1>}

      <div
        className={
          isNative
            ? `sticky top-0 z-40 -mx-4 space-y-2 px-4 pb-2 pt-safe transition-all duration-200 bg-background/95 backdrop-blur ${scrollDir === "down" ? "shadow-sm" : ""}`
            : "mt-6 space-y-2"
        }
      >
        {/* On native: tap on the search bar opens the full-screen search overlay */}
        {isNative && (
          <div className="relative">
            <SearchBar
              q={qDraft}
              onQChange={setQDraft}
              onSubmitQ={() => {
                void hapticImpact("medium");
                updateSearch({ q: qDraft });
              }}
              location={location}
              onLocationChange={handleLocationChange}
              selectedSlugs={[]}
              onSelectedChange={() => {}}
              categories={categories ?? []}
              hideCategory
              hideLocation
              qMode={search.qMode}
              onQModeChange={(m) => updateSearch({ qMode: m })}
              showQMode={false}
            />
            <button
              type="button"
              className="absolute inset-0 z-10"
              onClick={() => {
                void hapticImpact("light");
                setSearchOverlayOpen(true);
              }}
              aria-label="Åpne søk"
            />
          </div>
        )}
        {!isNative && (
          <SearchBar
            q={qDraft}
            onQChange={setQDraft}
            onSubmitQ={() => {
              void hapticImpact("medium");
              updateSearch({ q: qDraft });
            }}
            location={location}
            onLocationChange={handleLocationChange}
            selectedSlugs={
              search.category
                ? [
                    search.category,
                    ...search.categories.filter((s: string) => s !== search.category),
                  ]
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
        )}
        {isNative ? (
          <NativeFilterChips
            sort={search.sort}
            onSortChange={(s) => updateSearch({ sort: s })}
            categories={categories ?? []}
            selectedCategories={effectiveCategories}
            onCategoriesChange={(slugs) =>
              updateSearch({ category: "", categories: slugs, catMode: "any" })
            }
            min={search.min}
            max={search.max}
            includeFree={search.includeFree ?? true}
            onPriceChange={(mn, mx, free) => updateSearch({ min: mn, max: mx, includeFree: free })}
            conditions={search.conditions ?? []}
            onConditionsChange={(c) =>
              updateSearch({ conditions: c as z.infer<typeof conditionEnum>[] })
            }
            location={location}
            onLocationChange={handleLocationChange}
            resultCount={cards.length}
            onOpenAdvanced={() => setAdvancedOverlayOpen(true)}
            advancedFilterCount={
              (search.extraGroups?.length ?? 0) + (search.qMode === "any" ? 1 : 0)
            }
          />
        ) : (
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
        )}
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
        <div className="flex items-center gap-2">
          <span>
            {isLoading ? "Søker…" : `${cards.length} annonse${cards.length === 1 ? "" : "r"}`}
          </span>
          {isNative && (
            <button
              type="button"
              onClick={() => {
                void hapticImpact("light");
                const next = viewMode === "grid" ? "list" : "grid";
                setViewMode(next);
                try {
                  localStorage.setItem("kaupet_view_mode", next);
                } catch {
                  /* ignore */
                }
              }}
              className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={
                viewMode === "grid" ? "Bytt til listevisning" : "Bytt til rutenettvisning"
              }
            >
              {viewMode === "grid" ? (
                <LayoutList className="size-4" />
              ) : (
                <LayoutGrid className="size-4" />
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isDesktop && !isNative && (
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

      {/* ØK-tab — vises kun når søkkriterier gir treff */}
      {hasSearchCriteria && wtbCount > 0 && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("listings")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "listings"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Til salgs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("wtb")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "wtb"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Ønskes kjøpt ({wtbCount})
          </button>
        </div>
      )}

      {activeTab === "wtb" ? (
        <div className="mt-4">
          {wtbListings.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {wtbListings.map((w) => (
                <WtbListingCard key={w.id} listing={w} />
              ))}
            </div>
          )}
        </div>
      ) : (
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
              <div
                className={
                  isNative && viewMode === "list"
                    ? "flex flex-col gap-3"
                    : "grid grid-cols-2 gap-4 sm:grid-cols-3"
                }
              >
                {cards.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    highlighted={hoveredId === l.id || activeId === l.id}
                    onHoverChange={setHoveredId}
                    compact={isNative && viewMode === "list"}
                  />
                ))}
              </div>
            )}
            {/* Last inn flere (web) / Infinite scroll sentinel (native) */}
            {!isLoading &&
              cards.length >= PAGE_SIZE * loadedPages &&
              (isNative ? (
                <div ref={sentinelRef} className="h-4" />
              ) : (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={() => setLoadedPages((p) => p + 1)}>
                    Last inn flere annonser
                  </Button>
                </div>
              ))}
            {isLoading && loadedPages > 1 && (
              <div className="mt-6 flex justify-center">
                <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
      )}

      {/* Native kart-FAB + Sheet */}
      {isNative && (
        <>
          <Sheet open={mobileMapOpen} onOpenChange={setMobileMapOpen}>
            <SheetContent side="bottom" className="h-[88vh] p-4">
              <SheetHeader>
                <SheetTitle>Kart</SheetTitle>
              </SheetHeader>
              <div className="mt-3 h-[calc(100%-3rem)]">
                {mobileMapOpen ? renderMap(true) : null}
              </div>
            </SheetContent>
          </Sheet>
          <button
            type="button"
            onClick={() => {
              void hapticImpact("medium");
              setMobileMapOpen(true);
            }}
            className="fixed bottom-[calc(var(--app-bottom-nav-h)+1rem)] right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition"
            aria-label="Vis kart"
          >
            <MapIcon className="size-6" />
            {mapListings.length > 0 && (
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {mapListings.length > 99 ? "99+" : mapListings.length}
              </span>
            )}
          </button>
        </>
      )}

      {/* Native full-screen search overlay */}
      {isNative && (
        <NativeSearchOverlay
          open={searchOverlayOpen}
          onClose={() => setSearchOverlayOpen(false)}
          initialQ={qDraft}
          categories={categories ?? []}
        />
      )}

      {/* Native full-screen advanced search */}
      {isNative && (
        <NativeAdvancedSearch
          open={advancedOverlayOpen}
          onClose={() => setAdvancedOverlayOpen(false)}
          initial={advancedInitial}
          categories={categories ?? []}
          onApply={handleApply}
        />
      )}
    </div>
  );
}
