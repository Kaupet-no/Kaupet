export type Category = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  icon?: string | null;
  color?: string | null;
  heading_font?: string | null;
};

/**
 * Resolves selected category slugs (e.g. from `/annonser`'s `categories`
 * search param) to concrete category ids to filter listings by — a chosen
 * category includes every descendant, so picking a hub like "Bil og MC" or
 * "Reservedeler" matches listings filed at any depth below it.
 * Returns `null` when nothing is selected (no category constraint).
 */
export function resolveCategoryIds(
  selectedSlugs: string[],
  categories: Pick<Category, "id" | "slug" | "parent_id">[],
): string[] | null {
  if (selectedSlugs.length === 0) return null;
  const slugSet = new Set(selectedSlugs);
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    const children = childrenByParent.get(category.parent_id) ?? [];
    children.push(category.id);
    childrenByParent.set(category.parent_id, children);
  }

  const ids = new Set<string>();
  for (const category of categories) {
    if (!slugSet.has(category.slug)) continue;
    ids.add(category.id);
    const pending = [category.id];
    while (pending.length > 0) {
      const parentId = pending.pop()!;
      for (const childId of childrenByParent.get(parentId) ?? []) {
        if (ids.has(childId)) continue;
        ids.add(childId);
        pending.push(childId);
      }
    }
  }
  return Array.from(ids);
}
export type SortValue = "new" | "relevance" | "price_asc" | "price_desc";

export const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: "new", label: "Nyeste først" },
  { value: "relevance", label: "Mest relevant" },
  { value: "price_asc", label: "Pris: lav → høy" },
  { value: "price_desc", label: "Pris: høy → lav" },
];

export type CatTree = {
  roots: Category[];
  childrenByParent: Map<string, Category[]>;
  bySlug: Map<string, Category>;
  byId: Map<string, Category>;
};

export function buildTree(categories: Category[]): CatTree {
  const roots: Category[] = [];
  const childrenByParent = new Map<string, Category[]>();
  const bySlug = new Map<string, Category>();
  const byId = new Map<string, Category>();
  for (const c of categories) {
    bySlug.set(c.slug, c);
    byId.set(c.id, c);
    if (c.parent_id == null) roots.push(c);
    else {
      const arr = childrenByParent.get(c.parent_id) ?? [];
      arr.push(c);
      childrenByParent.set(c.parent_id, arr);
    }
  }
  return { roots, childrenByParent, bySlug, byId };
}

/** All descendant categories of `parent` at any depth (children, grandchildren, ...). */
export function descendants(parent: Category, tree: CatTree): Category[] {
  const out: Category[] = [];
  const stack = [...(tree.childrenByParent.get(parent.id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    out.push(next);
    stack.push(...(tree.childrenByParent.get(next.id) ?? []));
  }
  return out;
}

/** Breadcrumb path from a root category down to `category`, e.g. [Klær og mote, Herreklær, Kjole]. */
export function breadcrumbPath(category: Category, tree: CatTree): Category[] {
  const path: Category[] = [];
  let cur: Category | undefined = category;
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id ? tree.byId.get(cur.parent_id) : undefined;
  }
  return path;
}

/**
 * Categories strictly between `ancestor` and `descendant`, plus `descendant`
 * itself, in root-to-leaf order — e.g. pathFromAncestor(Interiør, Sofa)
 * returns [Møbler, Sofa]. Returns [] if `descendant` is `ancestor` itself or
 * isn't actually one of its descendants (e.g. a stale/tampered URL param).
 */
export function pathFromAncestor(
  ancestor: Category,
  descendant: Category,
  tree: CatTree,
): Category[] {
  if (descendant.id === ancestor.id) return [];
  const full = breadcrumbPath(descendant, tree);
  const idx = full.findIndex((c) => c.id === ancestor.id);
  if (idx === -1) return [];
  return full.slice(idx + 1);
}

/**
 * Resolves the category header (hero) a result set should be presented under,
 * given whichever category slugs the search is currently filtered by.
 *
 * A hero only makes sense when the selection sits inside a single main
 * category's branch — one colored root, everything else below it (which is
 * exactly what the category picker produces via `selectAllForParent`). A
 * colorless root or an unknown slug returns null and the page falls back to
 * its generic heading.
 *
 * `selected` is the category shown in the title and whose children become the
 * subcategory chips; `main` carries the presentation color, so the tint stays
 * put while the user drills deeper. `selected` is the deepest category that is
 * an ancestor of (or equal to) every selected category — i.e. their lowest
 * common ancestor — so narrowing to one category (or its full subtree) drills
 * the title down to it, while selecting several sibling branches at once
 * (e.g. multi-selecting subcategory chips under the same main category) falls
 * back to the closest shared ancestor instead of returning null.
 */
export function resolveHeroCategory(
  selectedSlugs: string[],
  tree: CatTree,
): { selected: Category; main: Category } | null {
  if (selectedSlugs.length === 0) return null;

  const paths: Category[][] = [];
  for (const slug of selectedSlugs) {
    const cat = tree.bySlug.get(slug);
    if (!cat) return null;
    paths.push(breadcrumbPath(cat, tree));
  }

  const main = paths[0][0];
  if (main.parent_id != null || !main.color) return null;
  if (paths.some((p) => p[0].id !== main.id)) return null;

  // Longest common prefix across every selected category's breadcrumb path —
  // its last entry is their lowest common ancestor, which is always at least
  // `main` since every path starts there.
  let common = paths[0];
  for (const p of paths.slice(1)) {
    const len = Math.min(common.length, p.length);
    let i = 0;
    while (i < len && common[i].id === p[i].id) i++;
    common = common.slice(0, i);
  }
  const candidate = common[common.length - 1];

  return { selected: candidate, main };
}

export function selectAllForParent(parent: Category, tree: CatTree): string[] {
  const kids = descendants(parent, tree);
  return [parent.slug, ...kids.map((k) => k.slug)];
}

/**
 * Er kategorivalget "ferdig" — en hovedkategori er valgt, og hvis den har
 * underkategorier, er minst én av dem også valgt (eller ingen finnes).
 * Brukes til å avgjøre når kategorivelgeren kan kollapse til en oppsummering.
 */
export function isCategorySelectionComplete(selectedSlugs: string[], tree: CatTree): boolean {
  const selectedCats = selectedSlugs
    .map((s) => tree.bySlug.get(s))
    .filter((c): c is Category => !!c);
  const firstSel = selectedCats[0];
  if (!firstSel) return false;
  const mainCat = breadcrumbPath(firstSel, tree)[0];
  const hasSubs = (tree.childrenByParent.get(mainCat.id) ?? []).length > 0;
  const hasSubSelected = selectedCats.some((c) => c.parent_id != null);
  return !hasSubs || hasSubSelected;
}

/**
 * Finds the best category to suggest for a free-text search query, e.g. for
 * an autocomplete hint while the user types in a search field.
 *
 * Plain `.find()`-style substring matching tends to surface an arbitrary
 * niche subcategory whose name happens to contain the query (e.g. "møb"
 * matching "Antikke møbler" before "Møbler og interiør"). This instead
 * scores candidates so a name that *starts with* the query wins over one
 * that merely contains it, and a main category wins over a subcategory at
 * the same match quality — closer to what a user typing a short prefix
 * actually expects.
 */
export function findCategorySuggestion<T extends { name_nb: string; parent_id: string | null }>(
  categories: T[],
  query: string,
): T | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  let best: T | null = null;
  let bestScore = -Infinity;
  for (const c of categories) {
    const name = c.name_nb.toLowerCase();
    if (name === needle) continue; // already an exact match — nothing to suggest
    if (!name.includes(needle)) continue;

    let score = 0;
    if (name.startsWith(needle)) score += 100;
    if (c.parent_id == null) score += 10;
    score -= name.length; // prefer the more specific (shorter) name among ties

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
