import type { CategoryNode } from "@/lib/category-filters";

/**
 * Ordered, reorderable, togglable field-group keys a category's flow is
 * built from (see src/features/listing-creation/field-groups/). Replaces the
 * earlier fixed 4-"canonical step" model, which couldn't represent native's
 * real content boundaries (price is bundled with category/condition, not
 * with location; description is its own native page but inline on web).
 */
export const DEFAULT_FIELD_GROUPS: string[] = [
  "title-photos",
  "category-attributes",
  "condition",
  "price",
  "description-keywords",
  "delivery-location",
  "review-publish",
];
export const DEFAULT_MODULES: string[] = ["generic-attributes"];

export type CategoryFlow = {
  fieldGroups: string[];
  modules: string[];
};

export type CategoryFlowRow = {
  id: string;
  category_id: string;
  field_groups: string[];
  modules: string[];
  sort_order: number;
};

const DEFAULT_FLOW: CategoryFlow = { fieldGroups: DEFAULT_FIELD_GROUPS, modules: DEFAULT_MODULES };

/**
 * Returns the effective flow (field groups + modules) for a category: the
 * flow declared on the category itself, or the nearest ancestor's flow, or
 * the default flow if no category in the chain has one. Unlike
 * category_filters (which merges parent + child by key), a child flow row
 * overrides its parent's field_groups/modules wholesale — a category either
 * opts into a fully custom flow or inherits one completely.
 */
export function effectiveFlowForCategory(
  categoryId: string | null,
  allFlows: CategoryFlowRow[],
  categoriesById: Map<string, CategoryNode>,
): CategoryFlow {
  if (!categoryId) return DEFAULT_FLOW;
  const flowsByCategoryId = new Map(allFlows.map((f) => [f.category_id, f]));
  let cur: CategoryNode | undefined = categoriesById.get(categoryId);
  while (cur) {
    const row = flowsByCategoryId.get(cur.id);
    if (row) return { fieldGroups: row.field_groups, modules: row.modules };
    cur = cur.parent_id ? categoriesById.get(cur.parent_id) : undefined;
  }
  return DEFAULT_FLOW;
}

/**
 * Chunks an ordered list of active field-group keys into wizard "pages" for a
 * given platform: web pages hold more groups per page, native pages hold
 * fewer. `title-photos` is always solo first; `review-publish` is always
 * solo last on native, and absorbs `delivery-location` as one page on web —
 * reproducing today's exact 3-web/5-native split for the default flow.
 *
 * Chunking is purely positional: it has no notion of "these groups prefer to
 * stay adjacent," so a category that reorders `delivery-location` between
 * `condition` and `price` will split them onto separate native pages purely
 * because of where `delivery-location` landed in the array. This is an
 * accepted limitation (not solved by a second hidden rule), mitigated by a
 * live pagination preview in the admin UI.
 */
export function resolveWizardPages(
  fieldGroupKeys: string[],
  options: { native: boolean },
): string[][] {
  const chunkSize = options.native ? 3 : 4;

  const withoutEnds = fieldGroupKeys.filter(
    (k) => k !== "title-photos" && k !== "review-publish" && k !== "delivery-location",
  );
  const hasTitlePhotos = fieldGroupKeys.includes("title-photos");
  const hasReviewPublish = fieldGroupKeys.includes("review-publish");
  const hasDeliveryLocation = fieldGroupKeys.includes("delivery-location");

  const pages: string[][] = [];
  if (hasTitlePhotos) pages.push(["title-photos"]);

  for (let i = 0; i < withoutEnds.length; i += chunkSize) {
    pages.push(withoutEnds.slice(i, i + chunkSize));
  }

  if (options.native) {
    if (hasDeliveryLocation) pages.push(["delivery-location"]);
    if (hasReviewPublish) pages.push(["review-publish"]);
  } else {
    const lastPage: string[] = [];
    if (hasDeliveryLocation) lastPage.push("delivery-location");
    if (hasReviewPublish) lastPage.push("review-publish");
    if (lastPage.length > 0) pages.push(lastPage);
  }

  return pages;
}
