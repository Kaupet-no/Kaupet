export type CategoryMatch = {
  matchedText: string;
  categorySlug: string;
  categoryName: string;
  /** "category": the matched text *is* the category name and gets stripped
   * from the query once applied (redundant once the filter exists).
   * "brand": the matched text is a vehicle brand (e.g. "Volvo") that
   * implies the category but should stay in the query, since it's still a
   * useful title-search term and isn't itself a category name. */
  source: "category" | "brand";
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds a category name typed as a whole phrase inside free-text search
 * (e.g. "mobiltelefon" or "sport og friluft"), so typing a category name
 * works the same as clicking the "Gå til kategori" suggestion — see
 * findCategorySuggestion in categories.ts, which this complements rather
 * than replaces (that one still drives the dropdown hint; this one decides
 * when to silently apply it as a filter without a click).
 *
 * Requires a whole-word match of the category's full name (not a prefix
 * like findCategorySuggestion allows), since auto-applying on a partial
 * word while the user is still typing would be premature. Picks the
 * longest matching name on overlap, consistent with the equipment/attribute
 * synonym matching's "longest phrase wins" rule.
 */
export function matchCategoryPhrase<T extends { slug: string; name_nb: string }>(
  query: string,
  categories: T[],
): CategoryMatch | null {
  const q = query.trim();
  if (!q) return null;

  let best: CategoryMatch | null = null;
  for (const c of categories) {
    const name = c.name_nb.trim();
    if (!name) continue;
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
    const m = q.match(re);
    if (!m) continue;
    if (!best || m[0].length > best.matchedText.length) {
      best = { matchedText: m[0], categorySlug: c.slug, categoryName: name, source: "category" };
    }
  }
  return best;
}

/**
 * Finds a known vehicle brand (e.g. "Volvo") typed as a whole word inside
 * free-text search, and maps it to the "Bil og MC" root category — without
 * this, a query like "Volvo med cruisecontrol" never gets a category
 * assigned (since "Volvo" isn't a category name), so the equipment-synonym
 * matcher in use-search-synonym-matches.ts never runs for "cruisecontrol"
 * (it requires a category to scope its vocabulary lookup against), and the
 * whole query falls through to a plain text search that finds nothing.
 *
 * Scoped to the "Bil og MC" root (not the specific "Bil"/"Motorsykkel"/...
 * subcategory the brand's `category_group` implies) — the root already
 * carries the shared equipment filters (utstyr_*) that this exists to
 * unlock, and guessing the exact subcategory slug from `category_group`
 * risks a wrong mapping; the root is always correct and sufficient.
 */
export function matchVehicleBrandPhrase(
  query: string,
  brands: { name: string }[],
  vehicleRootSlug = "bil-og-mc",
): CategoryMatch | null {
  const q = query.trim();
  if (!q) return null;

  let best: CategoryMatch | null = null;
  for (const b of brands) {
    const name = b.name.trim();
    if (!name) continue;
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
    const m = q.match(re);
    if (!m) continue;
    if (!best || m[0].length > best.matchedText.length) {
      best = {
        matchedText: m[0],
        categorySlug: vehicleRootSlug,
        categoryName: "Bil og MC",
        source: "brand",
      };
    }
  }
  return best;
}

/** Removes the matched category-name phrase from the raw query, keeping any
 * other free-text words (e.g. "hvit mobiltelefon" keeps "hvit" as a search
 * term once "mobiltelefon" becomes the category filter). */
export function removeCategoryMatch(query: string, match: CategoryMatch): string {
  return query
    .replace(new RegExp(`\\b${escapeRegExp(match.matchedText)}\\b`, "i"), " ")
    .replace(/\s+/g, " ")
    .trim();
}
