import { useMemo } from "react";
import { z } from "zod";
import { hapticNotification } from "@/lib/haptics";
import { valueToCriteria, type AdvancedSearchValue } from "@/components/advanced-search-value";
import type { LocationValue } from "@/components/location-filter";
import {
  searchSchema,
  conditionEnum,
  decodeAttrFilters,
  encodeAttrFilters,
} from "@/features/listing-search/search-schema";
import { buildTree } from "@/lib/categories";
import {
  effectiveFiltersForCategories,
  setAttributeFilterValue,
  type AttributeFilterValue,
  type CategoryFilter,
} from "@/lib/category-filters";

type Search = z.infer<typeof searchSchema>;
type Category = { id: string; slug: string; name_nb: string; parent_id: string | null };

/**
 * Derives all the search-page state that follows purely from the URL search
 * params (`search`) plus the categories/filters lookups: category tree,
 * effective attribute filters, decoded attribute values, the advanced-search
 * panel's initial value, the "save search" criteria, and the handlers that
 * write back to the URL. Pulled out of annonser.tsx (BrowsePage), which
 * mixed this with map state, WTB tab state, and the render tree.
 */
export function useAnnonserSearchState(params: {
  search: Search;
  // TanStack Router's route-scoped useNavigate() return type is tied to the
  // exact route registry and doesn't survive being passed through a plain
  // parameter — accept it loosely at this boundary rather than fight that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (opts: { search: any }) => void;
  categories: Category[] | undefined;
  allFilters: CategoryFilter[] | undefined;
  setQDraft: (q: string) => void;
}) {
  const { search, navigate, categories, allFilters, setQDraft } = params;

  const location: LocationValue = useMemo(
    () => ({
      lat: search.lat ?? null,
      lng: search.lng ?? null,
      radius: search.radius ?? 10,
      label: search.loc ?? "",
    }),
    [search.lat, search.lng, search.radius, search.loc],
  );
  // Merge legacy single `category` into `categories`
  const effectiveCategories = useMemo(() => {
    const arr = Array.isArray(search.categories) ? search.categories : [];
    if (search.category && !arr.includes(search.category)) return [...arr, search.category];
    return arr;
  }, [search.categories, search.category]);

  const categoryTree = useMemo(() => buildTree(categories ?? []), [categories]);

  const attrFilters = useMemo(() => {
    const ids = effectiveCategories
      .map((slug: string) => categoryTree.bySlug.get(slug)?.id)
      .filter((id): id is string => !!id);
    return effectiveFiltersForCategories(ids, allFilters ?? [], categoryTree.byId);
  }, [effectiveCategories, categoryTree, allFilters]);

  const attrValues = useMemo(() => decodeAttrFilters(search.attrs), [search.attrs]);

  const handleAttrValueChange = (key: string, value: AttributeFilterValue | undefined) => {
    const next = setAttributeFilterValue(attrValues, key, value);
    navigate({
      search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, attrs: encodeAttrFilters(next) }),
    });
  };

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

  return {
    location,
    effectiveCategories,
    categoryTree,
    attrFilters,
    attrValues,
    handleAttrValueChange,
    terms,
    advancedInitial,
    currentCriteria,
    updateSearch,
    handleApply,
    handleLocationChange,
    resetFilters,
  };
}
