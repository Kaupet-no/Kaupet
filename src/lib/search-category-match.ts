import type { CategoryFilter, CategoryNode, VehicleBrandGroup } from "@/lib/category-filters";
import { vehicleCategoriesForBrandGroup } from "@/lib/category-filters";

export type CategoryMatch = {
  matchedText: string;
  categorySlug: string;
  categoryName: string;
  /** "category": the matched text *is* the category name and gets stripped
   * from the query once applied (redundant once the filter exists).
   * "brand": the matched text is a vehicle brand (e.g. "Volvo") that
   * implies the category but should stay in the query, since it's still a
   * useful title-search term and isn't itself a category name.
   * "attribute": the matched text is a category-exclusive attribute option
   * value (e.g. "Stasjonsvogn", a `body_type` option only "Bil" has) — like
   * "brand", it stays in the query since it's still a useful search term. */
  source: "category" | "brand" | "attribute";
  /** Set only for `source: "brand"`: the brand's `vehicle_brands.category_group`,
   * for resolving the actual subcategory (e.g. "Bil") via
   * `vehicleCategoriesForBrandGroup` — `categorySlug`/`categoryName` above
   * are just the "Bil og MC" root fallback until that resolution completes.
   * See annonser.tsx for how this gets resolved into the final suggestion. */
  brandCategoryGroup: VehicleBrandGroup | null;
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
      best = {
        matchedText: m[0],
        categorySlug: c.slug,
        categoryName: name,
        source: "category",
        brandCategoryGroup: null,
      };
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
 * `categorySlug`/`categoryName` here are always the "Bil og MC" root — the
 * actual subcategory (e.g. "Bil") is resolved separately by the caller via
 * `vehicleCategoriesForBrandGroup` (category-filters.ts), using the brand's
 * `category_group` returned here as `brandCategoryGroup`. That resolution
 * needs live category-tree/filter data this function doesn't have, and for
 * some groups needs an async result-count comparison (see annonser.tsx) —
 * so this function only does the synchronous brand-name match and leaves
 * subcategory resolution to the caller.
 */
export function matchVehicleBrandPhrase(
  query: string,
  brands: { name: string; category_group: VehicleBrandGroup }[],
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
        brandCategoryGroup: b.category_group,
      };
    }
  }
  return best;
}

/**
 * Finds a whole-word match against the option labels of a category-exclusive
 * attribute filter (currently just `body_type`, e.g. "Stasjonsvogn"/"SUV" —
 * see 20260731170000_karosseri_filter.sql, scoped to the "Bil" category
 * only, unlike `color`/`fuel_type` which are shared across several vehicle
 * categories and would make this ambiguous). Since each option is only ever
 * defined on one category, this can map straight to that category without
 * the brand matcher's async candidate-disambiguation step.
 */
export function matchVehicleAttributeOptionPhrase<
  T extends { id: string; slug: string; name_nb: string },
>(
  query: string,
  allFilters: CategoryFilter[],
  categories: T[],
  keys: readonly string[] = ["body_type"],
): CategoryMatch | null {
  const q = query.trim();
  if (!q) return null;

  let best: CategoryMatch | null = null;
  for (const filter of allFilters) {
    if (!keys.includes(filter.key)) continue;
    const category = categories.find((c) => c.id === filter.category_id);
    if (!category) continue;
    for (const opt of filter.options ?? []) {
      const label = opt.label_nb.trim();
      if (!label) continue;
      const re = new RegExp(`\\b${escapeRegExp(label)}\\b`, "i");
      const m = q.match(re);
      if (!m) continue;
      if (!best || m[0].length > best.matchedText.length) {
        best = {
          matchedText: m[0],
          categorySlug: category.slug,
          categoryName: category.name_nb,
          source: "attribute",
          brandCategoryGroup: null,
        };
      }
    }
  }
  return best;
}

export type TitleCategorySuggestion = {
  category_id: string;
  parent_id: string | null;
  name_nb: string;
  parent_name_nb: string | null;
};

/**
 * Client-side fallback for the "Ny annonse" wizard's title-to-category
 * suggestion (see use-listing-title-hints.ts): `suggest_category_for_title`
 * (the RPC behind it) only matches free-text lexemes against historical
 * listings and category *names*, so a vehicle title like "Volvo V70
 * stasjonsvogn" — brand, model, no category name — never matches. Reuses the
 * same brand/attribute matchers the search bar (annonser.tsx) already relies
 * on for the identical problem, rather than teaching the RPC about brands.
 *
 * Tries the attribute match first (e.g. "Stasjonsvogn" → "Bil" directly,
 * since that `body_type` option is category-exclusive) since it resolves to
 * an exact leaf category. Falls back to a brand match (e.g. "Volvo" → the
 * "car" group), which can span more than one category
 * (`vehicleCategoriesForBrandGroup`) — when ambiguous, suggests the "Bil og
 * MC" root itself rather than guessing a leaf; the wizard's CategoryConfirm
 * step already collapses any all-under-"Bil og MC" suggestion set into a
 * root-level confirmation (see isUnderBilOgMc there), so a root suggestion
 * here degrades gracefully into that same flow.
 *
 * Unlike the search bar, a wrong suggestion here isn't a one-tap-reversible
 * filter — it's what CategoryConfirm asks the seller to accept. Many vehicle
 * brand names double as ordinary words or non-vehicle product brands (e.g.
 * "Yamaha keyboard P-125"), so a bare brand match is not enough evidence:
 * the brand branch additionally requires a whole-word match of a known model
 * belonging to that brand. No matching model → return null (no suggestion),
 * which is strictly better than a confidently wrong one. The trade is a
 * missed suggestion for a legitimate model not yet in the catalog — vehicle
 * sellers normally go through the registration-number lookup anyway.
 */
export function suggestVehicleCategoryForTitle<
  T extends { id: string; slug: string; name_nb: string; parent_id: string | null },
>(
  title: string,
  vehicleBrands: { id: string; name: string; category_group: VehicleBrandGroup }[],
  vehicleModels: { brand_id: string; name: string }[],
  allFilters: CategoryFilter[],
  categories: T[],
  categoriesById: Map<string, CategoryNode & { name_nb: string }>,
  bilOgMcCategoryId: string | null,
): TitleCategorySuggestion | null {
  const attributeMatch = matchVehicleAttributeOptionPhrase(title, allFilters, categories);
  const targetCategory = attributeMatch
    ? (categories.find((c) => c.slug === attributeMatch.categorySlug) ?? null)
    : (() => {
        const brandMatch = matchVehicleBrandPhrase(title, vehicleBrands);
        if (!brandMatch?.brandCategoryGroup) return null;
        const matchedBrandIds = vehicleBrands
          .filter((b) => b.name.trim().toLowerCase() === brandMatch.matchedText.toLowerCase())
          .map((b) => b.id);
        const hasModelMatch = vehicleModels.some((m) => {
          if (!matchedBrandIds.includes(m.brand_id)) return false;
          const name = m.name.trim();
          if (name.length < 2) return false;
          return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(title);
        });
        if (!hasModelMatch) return null;
        const candidates = vehicleCategoriesForBrandGroup(
          brandMatch.brandCategoryGroup,
          categories,
          allFilters,
          categoriesById,
        );
        if (candidates.length === 1) return candidates[0];
        return bilOgMcCategoryId
          ? (categories.find((c) => c.id === bilOgMcCategoryId) ?? null)
          : null;
      })();
  if (!targetCategory) return null;

  const parent = targetCategory.parent_id
    ? categoriesById.get(targetCategory.parent_id)
    : undefined;
  return {
    category_id: targetCategory.id,
    parent_id: targetCategory.parent_id,
    name_nb: targetCategory.name_nb,
    parent_name_nb: parent?.name_nb ?? null,
  };
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
