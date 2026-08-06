import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ActiveFilters } from "@/components/active-filters";
import type { ListingCardData } from "@/components/listing-card";
import type { MapListing } from "@/components/listings-map";
import { ResultList } from "@/components/result-list";
import { NativeFilterChips } from "@/components/native-filter-chips";
import { AttributeFilterChips } from "@/components/attribute-filter-chips";
import { CategoryHero } from "@/components/category-hero";
import {
  buildTree,
  descendants,
  pathFromAncestor,
  resolveCategoryIds,
  type Category,
} from "@/lib/categories";
import {
  normalizeFilter,
  vehicleCategoryGroupFor,
  genericBrandFilterFor,
} from "@/lib/category-filters";
import { getCategoryBehavior } from "@/lib/category-behavior";
import { BIL_OG_MC_SLUG } from "@/components/advanced-search-value";
import { SearchBar } from "@/components/search-bar";
import { searchSchema, conditionEnum } from "@/features/listing-search/search-schema";
import { useAnnonserSearchState } from "@/features/listing-search/use-annonser-search-state";
import { useFilterFacetCounts } from "@/features/listing-search/use-filter-facet-counts";
import { useListingsQuery } from "@/features/listing-search/use-listings-query";
import { useTextToFilterPipeline } from "@/features/listing-search/use-text-to-filter-pipeline";
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
  const [qDraft, setQDraft] = useState(search.q);
  const [isDesktop, setIsDesktop] = useState(false);
  // See annonser.tsx's identical field for why this exists — keyed by
  // "filterKey:optionValue" ("filterKey:" for single-value filters).
  const [autoAppliedText, setAutoAppliedText] = useState<Record<string, string>>({});
  const [justCreatedKeys, setJustCreatedKeys] = useState<Set<string>>(new Set());
  const flashKeys = (keys: string[]) => {
    if (keys.length === 0) return;
    setJustCreatedKeys((prev) => new Set([...prev, ...keys]));
    setTimeout(() => {
      setJustCreatedKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
    }, 1500);
  };

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

  // No Bil og MC listing has a "Tilstand" attribute, so the condition filter
  // is meaningless (and hidden) anywhere under that root category.
  const isBilOgMc = (breadcrumb[0]?.slug ?? category.slug) === BIL_OG_MC_SLUG;

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

  const { data: facetCounts } = useFilterFacetCounts({
    filters: attrFilters,
    values: attrValues,
    categoryIds: resolveCategoryIds(effectiveCategories, categories ?? []),
    conditions: search.conditions ?? [],
    min: search.min,
    max: search.max,
    includeFree: search.includeFree ?? true,
  });

  // Recognizes category-attribute vocabulary (e.g. "ryggekamera") and
  // number+unit facts typed into the search box — see
  // use-text-to-filter-pipeline.ts. This page always has a stable selected
  // category, so matching can run unconditionally.
  useTextToFilterPipeline({
    qDraft,
    setQDraft,
    updateSearch,
    attrFilters,
    allFilters: allFilters ?? [],
    attrValues,
    handleAttrValueChange,
    categoryId: selected.id,
    onApplied: (applied) => {
      setAutoAppliedText((prev) => ({ ...prev, ...applied }));
      flashKeys(Object.keys(applied));
    },
  });

  const removeAttrWithRestore = (key: string, value?: string) => {
    const composite = `${key}:${value ?? ""}`;
    const restoreText = autoAppliedText[composite];
    const current = attrValues[key];
    if (value !== undefined && current?.kind === "multiselect") {
      const next = current.values.filter((v) => v !== value);
      handleAttrValueChange(
        key,
        next.length > 0 ? { kind: "multiselect", values: next } : undefined,
      );
    } else {
      handleAttrValueChange(key, undefined);
    }
    if (restoreText) {
      setAutoAppliedText((prev) => {
        const next = { ...prev };
        delete next[composite];
        return next;
      });
      const nextQ = qDraft ? `${qDraft} ${restoreText}` : restoreText;
      setQDraft(nextQ);
      updateSearch({ q: nextQ });
    }
  };

  // Merke/Modell selected in the attribute filters get appended as extra
  // brødsmuler after the category chain, matching the ad-detail page's
  // breadcrumb so the two page types read as one continuous path.
  const extraSegments = useMemo(() => {
    const attributes: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(attrValues)) {
      if (v.kind === "text" || v.kind === "select") attributes[key] = v.value;
    }
    const vehicleGroup = vehicleCategoryGroupFor(selected.id, allFilters ?? [], tree.byId);
    const genericBrandFilter = genericBrandFilterFor(selected.id, allFilters ?? [], tree.byId);
    const rootCategorySlug = breadcrumb[0]?.slug ?? category.slug;
    return getCategoryBehavior(vehicleGroup).extraBreadcrumbSegments(attributes, {
      rootCategorySlug,
      genericBrandFilter,
    });
  }, [attrValues, allFilters, tree, selected, breadcrumb, category]);

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
    category_slug: l.category_slug,
    attributes: l.attributes,
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

  return (
    <div>
      {/* Entries before this page's own category are real ancestor pages with
          their own URL; the page's own category and any deeper `sub`
          selection just update the search param. */}
      <CategoryHero
        selected={selected}
        main={breadcrumb[0]}
        breadcrumbEntries={breadcrumbEntries}
        extraSegments={extraSegments}
        subcategories={children}
        onSelectCategory={selectCategory}
        linkUntilIndex={breadcrumb.length - 1}
      />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="space-y-2">
          <SearchBar
            q={qDraft}
            onQChange={setQDraft}
            onSubmitQ={() => updateSearch({ q: qDraft })}
            qMode={search.qMode}
            onQModeChange={(m) => updateSearch({ qMode: m })}
            showQMode={false}
            extraGroups={search.extraGroups ?? []}
            onExtraGroupsChange={(extraGroups) => updateSearch({ extraGroups })}
          />
          {isNative ? (
            <NativeFilterChips
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
              hideCondition={isBilOgMc}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <AttributeFilterChips
                filters={attrFilters}
                values={attrValues}
                onChange={handleAttrValueChange}
                isNative={isNative}
                resultCount={totalCount ?? cards.length}
                queryText={qDraft}
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
                hideCondition={isBilOgMc}
                counts={facetCounts}
              />
            </div>
          )}

          {/* Category-dependent filter row: primary fields stay visible, the
              rest sit behind "Se flere filter". */}
          {isNative && (
            <AttributeFilterChips
              filters={attrFilters}
              values={attrValues}
              onChange={handleAttrValueChange}
              isNative={isNative}
              resultCount={totalCount ?? cards.length}
              queryText={qDraft}
            />
          )}

          {/* Rendered inside the same space-y-2 group as the search bar and
              filter chips above, rather than as a separately-spaced sibling,
              so the active-criteria row reads as part of one continuous
              search-and-filter unit instead of a visually detached block. */}
          <ActiveFilters
            search={search}
            terms={terms}
            onUpdate={(patch) => updateSearch(patch)}
            attrFilters={attrFilters}
            attrValues={attrValues}
            location={location}
            onRemoveLocation={() =>
              updateSearch({ lat: undefined, lng: undefined, radius: undefined, loc: undefined })
            }
            onRemoveAttr={removeAttrWithRestore}
            justCreatedKeys={justCreatedKeys}
          />
        </div>

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
          onDropLastWord={(nextQ) => {
            setQDraft(nextQ);
            updateSearch({ q: nextQ });
          }}
          attrFilters={attrFilters}
          attrValues={attrValues}
          onRemoveAttr={(key) => removeAttrWithRestore(key)}
          mapListings={mapListings}
          mapCenter={mapCenter}
          radiusKm={search.radius ?? 10}
          onMapCenterChange={(c, label) =>
            updateSearch({ lat: c.lat, lng: c.lng, loc: label ?? "" })
          }
          onMapRadiusChange={(km) => updateSearch({ radius: km })}
          onMapClearLocation={() =>
            updateSearch({ lat: undefined, lng: undefined, radius: undefined, loc: undefined })
          }
          sort={search.sort}
          onSortChange={(s) => updateSearch({ sort: s })}
        />
      </div>
    </div>
  );
}
