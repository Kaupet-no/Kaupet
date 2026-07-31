export type CategoryMatch = {
  matchedText: string;
  categorySlug: string;
  categoryName: string;
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
      best = { matchedText: m[0], categorySlug: c.slug, categoryName: name };
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
