import type { z } from "zod";

import { descendants, selectAllForParent, type Category, type CatTree } from "@/lib/categories";
import type { searchSchema } from "@/features/listing-search/search-schema";

type UpdateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => void;

/** Category-selection handlers for the `/annonser` hero — pulled out of
 * BrowsePage since they're pure closures over search state with no hooks
 * of their own. See CategoryHero for where each is wired up. */

/** Ids a category selection actually covers: every selected slug counts as
 * itself plus all its descendants — the same expansion the listings query
 * applies — so a lone main-category slug (what a pick from the native
 * start page produces) already covers its whole branch. */
function coveredIds(slugs: string[], tree: CatTree): Set<string> {
  const ids = new Set<string>();
  for (const slug of slugs) {
    const category = tree.bySlug.get(slug);
    if (!category) continue;
    ids.add(category.id);
    for (const descendant of descendants(category, tree)) ids.add(descendant.id);
  }
  return ids;
}

/** The category itself plus all its descendants' ids. */
function branchIds(category: Category, tree: CatTree): Set<string> {
  const ids = new Set<string>([category.id]);
  for (const descendant of descendants(category, tree)) ids.add(descendant.id);
  return ids;
}

function covers(needle: Set<string>, haystack: Set<string>): boolean {
  for (const id of needle) {
    if (!haystack.has(id)) return false;
  }
  return true;
}

export function useHeroCategoryActions({
  categoryTree,
  effectiveCategories,
  updateSearch,
}: {
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

  // Subcategory chips under a hero: tapping a child narrows the selection
  // from all of `scope` (the category the chips belong to) down to that
  // child's branch; tapping an active child again deselects it, falling
  // back to the whole scope branch when nothing else is explicitly left.
  // Active state and toggling compare *coverage* rather than exact slug
  // lists — a selection can be implicit, e.g. a lone main-category slug
  // that already covers its entire branch.
  const isChildActive = (scope: Category, child: Category) => {
    const covered = coveredIds(effectiveCategories, categoryTree);
    if (covers(branchIds(scope, categoryTree), covered)) return false;
    return covers(branchIds(child, categoryTree), covered);
  };

  const toggleChildCategory = (scope: Category, child: Category) => {
    const covered = coveredIds(effectiveCategories, categoryTree);
    const scopeBranch = branchIds(scope, categoryTree);
    const childBranch = branchIds(child, categoryTree);
    const wholeScopeActive = covers(scopeBranch, covered);
    const childActive = !wholeScopeActive && covers(childBranch, covered);

    let next: string[];
    if (wholeScopeActive) {
      // Narrowing from "everything in this scope" to just this child.
      next = selectAllForParent(child, categoryTree);
    } else if (childActive) {
      // Deselecting this child — fall back to the whole scope if nothing
      // else is explicitly selected.
      const remaining = effectiveCategories.filter((slug) => {
        const category = categoryTree.bySlug.get(slug);
        return category == null || !childBranch.has(category.id);
      });
      next = remaining.length === 0 ? selectAllForParent(scope, categoryTree) : remaining;
    } else {
      next = [...new Set([...effectiveCategories, ...selectAllForParent(child, categoryTree)])];
    }
    updateSearch({ category: "", categories: next, catMode: "any" });
  };

  return { selectHeroCategory, toggleChildCategory, isChildActive };
}
