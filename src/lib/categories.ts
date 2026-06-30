export type Category = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  icon?: string | null;
  color?: string | null;
};

/** Main categories are colored root categories presented as Kaupet sub-sites. */
export function mainCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.parent_id == null && !!c.color);
}
export type SortValue = "new" | "price_asc" | "price_desc";

export const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: "new", label: "Nyeste først" },
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

export function categoryLabel(selectedSlugs: string[], tree: CatTree): string {
  if (selectedSlugs.length === 0) return "Alle kategorier";
  const set = new Set(selectedSlugs);

  // "Alle i parent": parent slug + all its children slugs present
  for (const root of tree.roots) {
    const kids = tree.childrenByParent.get(root.id) ?? [];
    if (kids.length === 0) continue;
    const allChildrenSlugs = kids.map((k) => k.slug);
    const hasAll =
      set.has(root.slug) &&
      allChildrenSlugs.every((s) => set.has(s)) &&
      set.size === 1 + allChildrenSlugs.length;
    if (hasAll) return root.name_nb;
  }

  if (selectedSlugs.length === 1) {
    const c = tree.bySlug.get(selectedSlugs[0]);
    if (!c) return "1 kategori";
    if (c.parent_id) {
      const parent = tree.byId.get(c.parent_id);
      return parent ? `${parent.name_nb} › ${c.name_nb}` : c.name_nb;
    }
    return c.name_nb;
  }
  return `${selectedSlugs.length} kategorier`;
}

export function selectAllForParent(parent: Category, tree: CatTree): string[] {
  const kids = tree.childrenByParent.get(parent.id) ?? [];
  return [parent.slug, ...kids.map((k) => k.slug)];
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
