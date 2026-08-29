import type { z } from "zod";

import { selectAllForParent, type Category, type CatTree } from "@/lib/categories";
import type { searchSchema } from "@/features/listing-search/search-schema";

type UpdateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => void;

/** Category-selection handlers for the `/annonser` hero — pulled out of
 * BrowsePage since they're pure closures over search state with no hooks
 * of their own. See CategoryHero for where each is wired up. */
export function useHeroCategoryActions({
  hero,
  categoryTree,
  effectiveCategories,
  updateSearch,
}: {
  hero: { main: Category; selected: Category } | null;
  categoryTree: CatTree;
  effectiveCategories: string[];
  updateSearch: UpdateSearch;
}) {
  // Selecting a category inside the hero keeps the user on /annonser, so the
  // query text and every other filter in the URL survive. Descendants are
  // listed explicitly because the listings query only expands *root*
  // categories one level (see use-listings-query.ts).
  const selectHeroCategory = (target: Category) =>
    updateSearch({
      category: "",
      categories: selectAllForParent(target, categoryTree),
      catMode: "any",
    });

  // Always-visible category row above the search bar: tapping a main
  // category selects its whole branch immediately (same as selectHeroCategory
  // above); tapping a subcategory narrows to just that branch, toggling it
  // off again falls back to the whole main category.
  const selectRootCategory = (root: Category) => {
    const alreadyActive = effectiveCategories.some((slug) =>
      selectAllForParent(root, categoryTree).includes(slug),
    );
    updateSearch({
      category: "",
      categories: alreadyActive ? [] : selectAllForParent(root, categoryTree),
      catMode: "any",
    });
  };

  const toggleChildCategory = (root: Category, child: Category) => {
    const selected = new Set(effectiveCategories);
    const wholeBranch = selectAllForParent(root, categoryTree);
    const wholeBranchSelected = wholeBranch.every((slug) => selected.has(slug));
    const childBranch = selectAllForParent(child, categoryTree);
    const childActive = !wholeBranchSelected && childBranch.every((slug) => selected.has(slug));

    let next: string[];
    if (wholeBranchSelected) {
      // Narrowing from "everything in this main category" to just this child.
      next = childBranch;
    } else if (childActive) {
      // Deselecting this child — fall back to the whole branch if nothing
      // else is explicitly selected.
      const remaining = effectiveCategories.filter((slug) => !childBranch.includes(slug));
      next = remaining.length === 0 ? wholeBranch : remaining;
    } else {
      next = [...new Set([...effectiveCategories, ...childBranch])];
    }
    updateSearch({ category: "", categories: next, catMode: "any" });
  };

  const isHeroChildActive = (child: Category) => {
    if (!hero) return false;
    const wholeBranchSelected = selectAllForParent(hero.main, categoryTree).every((slug) =>
      effectiveCategories.includes(slug),
    );
    if (wholeBranchSelected) return false;
    return selectAllForParent(child, categoryTree).every((slug) =>
      effectiveCategories.includes(slug),
    );
  };

  return { selectHeroCategory, selectRootCategory, toggleChildCategory, isHeroChildActive };
}
