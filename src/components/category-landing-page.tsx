import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ActiveFilters } from "@/components/active-filters";
import type { ListingCardData } from "@/components/listing-card";
import type { MapListing } from "@/components/listings-map";
import { ResultList } from "@/components/result-list";
import { DesktopFilterChips } from "@/components/desktop-filter-chips";
import { NativeFilterChips } from "@/components/native-filter-chips";
import { AttributeFilterChips } from "@/components/attribute-filter-chips";
import { getCategoryIcon } from "@/lib/category-icons";
import { buildTree, descendants, pathFromAncestor, type Category } from "@/lib/categories";
import { normalizeFilter } from "@/lib/category-filters";
import { SearchBar } from "@/components/search-bar";
import { searchSchema, conditionEnum } from "@/features/listing-search/search-schema";
import { useAnnonserSearchState } from "@/features/listing-search/use-annonser-search-state";
import { useListingsQuery } from "@/features/listing-search/use-listings-query";
import { useIsNative } from "@/hooks/use-is-native";

type Search = z.infer<typeof searchSchema>;

type Props = {
  /** This page's own URL-level category — a main category for /{slug}, or a
   * subcategory for /{main}/{sub}. Drilling deeper (via `subSlug`) never
   * leaves this page — it only changes which descendant is scoped/shown. */
  category: Category;
  /** Breadcrumb chain of *real, distinct URLs* leading to (and including)
   * `category` — [main] or [main, sub]. */
  breadcrumb: Category[];
  /** Slug of a descendant of `category` to scope the page to instead —
   * e.g. from the homepage's category picker drilling past this page's own
   * level (Interiør > Møbler > Sofa still lands on /interiør, with `sub`
   * carrying "sofa"). Ignored if it isn't actually a descendant of `category`. */
  subSlug?: string;
  /** Search param key `subSlug` is read from/written to — "sub" on
   * /{main}, but that name is already a path param on /{main}/{sub}, so that
   * route uses "sub2" instead. */
  subSlugParam: "sub" | "sub2";
  /** Full /annonser-shaped search state for this route — the page shares the
   * same schema and query logic as /annonser, only forcing the category. */
  search: Search;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (opts: { search: any }) => void;
};

/**
 * Category landing page — renders the exact same filter row, active-filter
 * chips and result list as /annonser (via useAnnonserSearchState/
 * useListingsQuery/ResultList), scoped to this page's category, with a hero
 * banner on top for quick sub-category drilldown and SEO copy.
 */
export function CategoryLandingPage({
  category,
  breadcrumb,
  subSlug,
  subSlugParam,
  search,
  navigate,
}: Props) {
  const isNative = useIsNative();
  const routerNavigate = useNavigate();
  const [qDraft, setQDraft] = useState(search.q);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => setQDraft(search.q), [search.q]);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const { data: categories } = useQuery({
    queryKey: ["categories", "with-color"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color")
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

  const tree = useMemo(() => buildTree(categories ?? []), [categories]);

  // The category actually scoped/shown right now — `category` itself, or one
  // of its descendants when `subSlug` deep-links past this page's own level.
  const selected = useMemo(() => {
    if (!subSlug) return category;
    const found = tree.bySlug.get(subSlug);
    if (!found || found.id === category.id) return category;
    const isDescendant = descendants(category, tree).some((d) => d.id === found.id);
    return isDescendant ? found : category;
  }, [subSlug, category, tree]);

  const extraPath = useMemo(
    () => pathFromAncestor(category, selected, tree),
    [category, selected, tree],
  );
  const breadcrumbEntries = useMemo(() => [...breadcrumb, ...extraPath], [breadcrumb, extraPath]);
  const children = tree.childrenByParent.get(selected.id) ?? [];

  // Selecting a different (deeper/shallower/sibling) category never navigates
  // away from this page's own URL — it only updates the search param.
  const selectCategory = (target: Category) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        [subSlugParam]: target.id === category.id ? undefined : target.slug,
      }),
    });
  };

  // The set of category slugs this page is scoped to — `selected` plus every
  // descendant at any depth, so a hub category (e.g. "Møbler") still covers
  // all its leaves ("Sofa", "Stol", ...), matching what this page showed
  // before it shared /annonser's single-level-expansion query logic.
  const scopedSlugs = useMemo(
    () => [selected.slug, ...descendants(selected, tree).map((d) => d.slug)],
    [selected, tree],
  );

  const effectiveSearch: Search = useMemo(
    () => ({ ...search, category: "", categories: scopedSlugs, catMode: "any" }),
    [search, scopedSlugs],
  );

  const {
    location,
    effectiveCategories,
    attrFilters,
    attrValues,
    handleAttrValueChange,
    terms,
    updateSearch,
    handleLocationChange,
    resetFilters,
  } = useAnnonserSearchState({
    search: effectiveSearch,
    navigate,
    categories: categories ?? undefined,
    allFilters,
    setQDraft,
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

  const {
    data: listingsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListingsQuery({
    search: effectiveSearch,
    categories: categories ?? undefined,
    effectiveCategories,
    terms,
    radiusIds,
  });

  const listings = useMemo(() => listingsData?.pages.flatMap((p) => p.rows), [listingsData]);
  const totalCount = listingsData?.pages[0]?.totalCount ?? null;

  const cards: ListingCardData[] = (listings ?? []).map((l) => ({
    id: l.id,
    kaupet_code: l.kaupet_code,
    title: l.title,
    subtitle: l.subtitle,
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

  const Icon = getCategoryIcon(selected.icon ?? null);
  // Only "hub" main categories carry a presentation color — always the first
  // breadcrumb entry — so the page's tint stays put while drilling deeper.
  const accent = breadcrumb[0]?.color ?? undefined;

  // Picking a different top-level category than this page's own leaves this
  // page's SEO URL behind and lands on the canonical /annonser listing —
  // same rule the homepage's category picker follows.
  const onCategoriesChange = (slugs: string[]) => {
    routerNavigate({
      to: "/annonser",
      search: { q: search.q, category: "", categories: slugs, catMode: "any", sort: search.sort },
    });
  };

  return (
    <div>
      <section
        className="relative overflow-hidden"
        style={accent ? { background: accent } : undefined}
      >
        <div className="absolute inset-0 bg-background/80" aria-hidden />
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-12">
          <nav aria-label="Brødsmulesti" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <Link
              to="/annonser"
              search={{ q: "", category: "", sort: "new" }}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Alle kategorier
            </Link>
            {breadcrumbEntries.map((c, i) => {
              const isLast = i === breadcrumbEntries.length - 1;
              // Entries before this page's own category are real ancestor
              // pages with their own URL; the page's own category and any
              // deeper `sub` selection just update the search param.
              const isAboveOwnCategory = i < breadcrumb.length - 1;
              return (
                <span key={c.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  {isLast ? (
                    <span className="font-medium">{c.name_nb}</span>
                  ) : isAboveOwnCategory ? (
                    <Link
                      to="/$kaupetCode"
                      params={{ kaupetCode: c.slug }}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {c.name_nb}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectCategory(c)}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {c.name_nb}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <span
              className="flex size-12 items-center justify-center rounded-full text-white"
              style={{ background: accent ?? "var(--primary)" }}
            >
              <Icon className="size-6" />
            </span>
            <h1 className="font-display text-4xl tracking-tight">/{selected.name_nb}</h1>
          </div>
          {children.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCategory(c)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm transition hover:border-primary hover:text-primary"
                >
                  {c.name_nb}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="space-y-2">
          <SearchBar
            q={qDraft}
            onQChange={setQDraft}
            onSubmitQ={() => updateSearch({ q: qDraft })}
            location={location}
            onLocationChange={handleLocationChange}
            selectedSlugs={[]}
            onSelectedChange={() => {}}
            categories={categories ?? []}
            hideCategory
            qMode={search.qMode}
            onQModeChange={(m) => updateSearch({ qMode: m })}
            showQMode={false}
          />
          {isNative ? (
            <NativeFilterChips
              sort={search.sort}
              onSortChange={(s) => updateSearch({ sort: s })}
              categories={categories ?? []}
              selectedCategories={effectiveCategories}
              onCategoriesChange={onCategoriesChange}
              min={search.min}
              max={search.max}
              includeFree={search.includeFree ?? true}
              onPriceChange={(mn, mx, free) =>
                updateSearch({ min: mn, max: mx, includeFree: free })
              }
              conditions={search.conditions ?? []}
              onConditionsChange={(c) =>
                updateSearch({ conditions: c as z.infer<typeof conditionEnum>[] })
              }
              location={location}
              onLocationChange={handleLocationChange}
              resultCount={totalCount ?? cards.length}
              onOpenAdvanced={() => {}}
              advancedFilterCount={0}
            />
          ) : (
            <DesktopFilterChips
              sort={search.sort}
              onSortChange={(s) => updateSearch({ sort: s })}
              categories={categories ?? []}
              selectedCategories={effectiveCategories}
              onCategoriesChange={onCategoriesChange}
              min={search.min}
              max={search.max}
              includeFree={search.includeFree ?? true}
              onPriceChange={(mn, mx, free) =>
                updateSearch({ min: mn, max: mx, includeFree: free })
              }
              conditions={search.conditions ?? []}
              onConditionsChange={(c) =>
                updateSearch({ conditions: c as z.infer<typeof conditionEnum>[] })
              }
              qMode={search.qMode}
              onQModeChange={(m) => updateSearch({ qMode: m })}
              extraGroups={search.extraGroups ?? []}
              onExtraGroupsChange={(extraGroups) => updateSearch({ extraGroups })}
            />
          )}

          {/* Category-dependent filter row: primary fields stay visible, the
              rest sit behind "Se flere filter". */}
          <AttributeFilterChips
            filters={attrFilters}
            values={attrValues}
            onChange={handleAttrValueChange}
            isNative={isNative}
            resultCount={totalCount ?? cards.length}
          />
        </div>

        <ActiveFilters
          search={search}
          terms={terms}
          onUpdate={(patch) => updateSearch(patch)}
          attrFilters={attrFilters}
          attrValues={attrValues}
          onRemoveAttr={(key, value) => {
            const current = attrValues[key];
            if (value !== undefined && current?.kind === "multiselect") {
              const next = current.values.filter((v) => v !== value);
              handleAttrValueChange(
                key,
                next.length > 0 ? { kind: "multiselect", values: next } : undefined,
              );
              return;
            }
            handleAttrValueChange(key, undefined);
          }}
        />

        <ResultList
          isNative={isNative}
          isDesktop={isDesktop}
          q={search.q}
          effectiveCategories={[selected.slug]}
          cards={cards}
          totalCount={totalCount}
          isLoading={isLoading}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={() => void fetchNextPage()}
          resetFilters={resetFilters}
          mapListings={mapListings}
          mapCenter={mapCenter}
          radiusKm={search.radius ?? 10}
          onMapCenterChange={(c, label) =>
            updateSearch({ lat: c.lat, lng: c.lng, radius: search.radius ?? 10, loc: label ?? "" })
          }
          onMapAreaSearch={(c, label) =>
            updateSearch({ lat: c.lat, lng: c.lng, radius: search.radius ?? 10, loc: label ?? "" })
          }
        />
      </div>
    </div>
  );
}
