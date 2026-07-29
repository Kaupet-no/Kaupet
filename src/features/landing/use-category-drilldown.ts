import { useEffect, useMemo, useRef, useState } from "react";
import {
  effectiveFiltersForCategories,
  effectiveFiltersForCategory,
  splitPrimaryFilters,
  type AttributeFilterValue,
  type CategoryFilter,
} from "@/lib/category-filters";
import { encodeAttrFilters } from "@/features/listing-search/search-schema";
import type { CategoryRow } from "@/features/landing/landing-types";

/**
 * Owns the landing page's category drilldown panel: the selected path
 * (root -> ... -> deepest picked category), the primary/secondary attribute
 * filters for whatever's currently selected, and the navigation handlers
 * (pick a root, drill into a sub, go back, jump to a breadcrumb depth, or
 * leave the panel entirely for /annonser or a category's own landing page).
 * Pulled out of index.tsx (WebLanding), which mixed this with hero search,
 * result-count/feed fetching, and the render tree.
 */
export function useCategoryDrilldown(params: {
  childrenByParent: Map<string, CategoryRow[]>;
  categoriesById: Map<string, CategoryRow>;
  allFilters: CategoryFilter[] | undefined;
  navigate: (opts: { to: string; params?: object; search?: object }) => void;
}) {
  const { childrenByParent, categoriesById, allFilters, navigate } = params;

  const [selectedPath, setSelectedPath] = useState<CategoryRow[]>([]);
  const activeCategory = selectedPath[0] ?? null;
  const currentParent = selectedPath[selectedPath.length - 1] ?? null;
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // Tracks which way the subcategory list/filter panel should slide in, so
  // drilling deeper feels like moving forward (from the right) and going
  // back feels like retreating (from the left) — matching the hero swap.
  const [navDirection, setNavDirection] = useState<"forward" | "back">("forward");
  const [filterValues, setFilterValues] = useState<Record<string, AttributeFilterValue>>({});
  const [priceMin, setPriceMin] = useState<number | undefined>(undefined);
  const [priceMax, setPriceMax] = useState<number | undefined>(undefined);
  const subcatRef = useRef<HTMLDivElement>(null);

  const activeFilters = useMemo(() => {
    if (!currentParent) return [];
    const leaves: CategoryRow[] = [];
    const stack = [...(childrenByParent.get(currentParent.id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      const children = childrenByParent.get(next.id) ?? [];
      if (children.length === 0) leaves.push(next);
      else stack.push(...children);
    }
    if (leaves.length > 0) {
      return effectiveFiltersForCategories(
        leaves.map((l) => l.id),
        allFilters ?? [],
        categoriesById,
      );
    }
    return effectiveFiltersForCategory(currentParent.id, allFilters ?? [], categoriesById);
  }, [currentParent, childrenByParent, allFilters, categoriesById]);
  const { primary: primaryFilters, secondary: secondaryFilters } = useMemo(
    () => splitPrimaryFilters(activeFilters),
    [activeFilters],
  );
  // Collapse "flere valg" again whenever the drilled-into category changes,
  // unless there are only a couple of secondary filters — cheap enough to
  // show by default rather than hiding behind an extra click.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  useEffect(
    () => setMoreFiltersOpen(secondaryFilters.length > 0 && secondaryFilters.length <= 2),
    [currentParent?.id, secondaryFilters.length],
  );

  // currentParent plus every descendant category — the same scope /$kaupetCode
  // applies when it renders results for this category, so the live count below
  // matches what "Vis treff" will actually navigate to.
  const currentCategoryIds = useMemo(() => {
    if (!currentParent) return [];
    const ids = [currentParent.id];
    const stack = [...(childrenByParent.get(currentParent.id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      ids.push(next.id);
      stack.push(...(childrenByParent.get(next.id) ?? []));
    }
    return ids;
  }, [currentParent, childrenByParent]);

  function goToCategory(cat: CategoryRow) {
    navigate({
      to: "/annonser",
      search: {
        q: "",
        category: cat.slug,
        sort: "new",
        ...(Object.keys(filterValues).length > 0 && { attrs: encodeAttrFilters(filterValues) }),
        ...(priceMin !== undefined && { min: priceMin }),
        ...(priceMax !== undefined && { max: priceMax }),
      },
    });
  }

  // Any depth of category selection lands on the root main category's own
  // landing page (/{main}) — the deeper picks (e.g. Interiør > Møbler > Sofa)
  // are represented by the `sub` search param instead of a nested URL, so
  // the page can show the full breadcrumb and let the user step back up to a
  // sibling (Bord, Seng, …) without leaving /{main}.
  // Any depth of category selection lands on the root main category's own
  // landing page (/{main}) — the deeper picks (e.g. Interiør > Møbler > Sofa)
  // are represented by the `sub` search param instead of a nested URL, so
  // the page can show the full breadcrumb and let the user step back up to a
  // sibling (Bord, Seng, …) without leaving /{main}.
  const goToCategoryPage = (path: CategoryRow[]) => {
    if (path.length === 0) return;
    const root = path[0];
    const deepest = path[path.length - 1];
    navigate({
      to: "/$kaupetCode",
      params: { kaupetCode: root.slug },
      search: {
        ...(deepest.id !== root.id && { sub: deepest.slug }),
        ...(Object.keys(filterValues).length > 0 && { attrs: encodeAttrFilters(filterValues) }),
        ...(priceMin !== undefined && { min: priceMin }),
        ...(priceMax !== undefined && { max: priceMax }),
      },
    });
  };

  const handlePickCategory = (cat: CategoryRow) => {
    // Clicking the already-active root category again closes it and returns
    // the landing page to its default state, instead of just re-selecting it.
    if (activeCategory?.id === cat.id) {
      setSelectedPath([]);
      setFilterValues({});
      setPriceMin(undefined);
      setPriceMax(undefined);
      setCategoriesOpen(false);
      return;
    }
    const subs = childrenByParent.get(cat.id) ?? [];
    if (subs.length === 0) {
      goToCategory(cat);
      return;
    }
    setSelectedPath([cat]);
    setFilterValues({});
    setPriceMin(undefined);
    setPriceMax(undefined);
    setCategoriesOpen(true);
    setNavDirection("forward");
    // Scroll so the newly revealed subcategories are visible after the slide-down.
    requestAnimationFrame(() => {
      setTimeout(
        () => subcatRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        80,
      );
    });
  };

  // Drill one level deeper from the subcategory grid — whether or not `sub`
  // turns out to have children of its own, so a leaf like "Bukse" or "TV"
  // still reveals its own filters instead of navigating away immediately.
  const drillIntoSub = (sub: CategoryRow) => {
    setSelectedPath((prev) => [...prev, sub]);
    setFilterValues({});
    setPriceMin(undefined);
    setPriceMax(undefined);
    setNavDirection("forward");
    requestAnimationFrame(() => {
      setTimeout(
        () => subcatRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        80,
      );
    });
  };

  const goBack = () => {
    if (selectedPath.length > 1) {
      setSelectedPath((prev) => prev.slice(0, -1));
    } else {
      setSelectedPath([]);
      setCategoriesOpen(false);
    }
    setFilterValues({});
    setPriceMin(undefined);
    setPriceMax(undefined);
    setNavDirection("back");
  };

  const jumpToDepth = (index: number) => {
    setSelectedPath((prev) => prev.slice(0, index + 1));
    setFilterValues({});
    setPriceMin(undefined);
    setPriceMax(undefined);
    setNavDirection("back");
  };

  return {
    selectedPath,
    setSelectedPath,
    activeCategory,
    currentParent,
    categoriesOpen,
    setCategoriesOpen,
    navDirection,
    filterValues,
    setFilterValues,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    subcatRef,
    activeFilters,
    primaryFilters,
    secondaryFilters,
    moreFiltersOpen,
    setMoreFiltersOpen,
    currentCategoryIds,
    goToCategory,
    goToCategoryPage,
    handlePickCategory,
    drillIntoSub,
    goBack,
    jumpToDepth,
  };
}
