import type { CategoryNode } from "@/lib/category-filters";

/**
 * Ordered, reorderable, togglable field-group keys a category's flow is
 * built from (see src/features/listing-creation/field-groups/). Replaces the
 * earlier fixed 4-"canonical step" model, which couldn't represent native's
 * real content boundaries (price is bundled with category/condition, not
 * with location; description is its own native page but inline on web).
 */
export const DEFAULT_FIELD_GROUPS: string[] = [
  "photos",
  "title",
  "category-attributes",
  "condition",
  "price",
  "description-keywords",
  "delivery",
  "location",
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

export function normalizeFieldGroupKeys(keys: string[]): string[] {
  const normalized = keys.flatMap((key) => {
    if (key === "title-photos") return ["photos", "title"];
    if (key === "delivery-location") return ["delivery", "location"];
    return [key];
  });
  if (!normalized.includes("vehicle-registration")) return normalized;
  return normalized.filter((key) => key !== "title" && key !== "delivery");
}

/** Writers keep legacy keys until the phase 6 transition migration is applied everywhere. */
export function toStoredFieldGroupKeys(keys: string[]): string[] {
  const stored: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === "photos") {
      stored.push("title-photos");
      if (keys[index + 1] === "title") index += 1;
    } else if (keys[index] === "delivery" && keys[index + 1] === "location") {
      stored.push("delivery-location");
      index += 1;
    } else if (keys[index] === "location") {
      stored.push("delivery-location");
    } else {
      stored.push(keys[index]);
    }
  }
  return stored;
}

/**
 * Returns the effective flow (field groups + modules) for a category: the
 * flow declared on the category itself, or the nearest ancestor's flow, or
 * the default flow if no category in the chain has one. Unlike
 * category_filters (which merges parent + child by key), a child flow row
 * overrides its parent's field_groups/modules wholesale — a category either
 * opts into a fully custom flow or inherits one completely.
 *
 * `category-select` is always prepended and is never part of the stored
 * `field_groups` — it's a structural, always-first step (pick a category
 * before anything else), not admin-configurable content.
 */
export function effectiveFlowForCategory(
  categoryId: string | null,
  allFlows: CategoryFlowRow[],
  categoriesById: Map<string, CategoryNode>,
): CategoryFlow {
  if (!categoryId) return prependCategorySelect(DEFAULT_FLOW);
  const flowsByCategoryId = new Map(allFlows.map((f) => [f.category_id, f]));
  let cur: CategoryNode | undefined = categoriesById.get(categoryId);
  while (cur) {
    const row = flowsByCategoryId.get(cur.id);
    if (row) {
      return prependCategorySelect({
        fieldGroups: normalizeFieldGroupKeys(row.field_groups),
        modules: row.modules,
      });
    }
    cur = cur.parent_id ? categoriesById.get(cur.parent_id) : undefined;
  }
  return prependCategorySelect(DEFAULT_FLOW);
}

function prependCategorySelect(flow: CategoryFlow): CategoryFlow {
  return { ...flow, fieldGroups: ["category-select", ...flow.fieldGroups] };
}

/**
 * Chunks an ordered list of active field-group keys into wizard "pages" for a
 * given platform: web pages hold more groups per page, native pages hold
 * fewer. `category-select` is always solo first (category must be chosen
 * before anything else, including the full title/photo step). Location and
 * review/publish share the final page on both platforms so native users do
 * not have to advance through a separate confirmation-only step.
 * `title-photos` is no longer forced first — its position is just whatever
 * order it has in `fieldGroupKeys`, so a category flow can put
 * `category-attributes` (and any vehicle lookup it triggers) before it.
 *
 * Chunking is purely positional: it has no notion of "these groups prefer to
 * stay adjacent," so a category that reorders `delivery-location` between
 * `condition` and `price` will split them onto separate native pages purely
 * because of where `delivery-location` landed in the array. This is an
 * accepted limitation (not solved by a second hidden rule), mitigated by a
 * live pagination preview in the admin UI.
 */
/** Field-group keys that always get their own solo page, wherever they land
 * in the ordered array — `category-select` is always first (see
 * prependCategorySelect); `vehicle-registration`/`vehicle-confirm` can land
 * anywhere in the array (admin-configurable position for the former,
 * runtime-injected right after it for the latter), but must never be bundled
 * with unrelated groups like `condition`/`price`. */
const SOLO_FIELD_GROUP_KEYS = new Set([
  "category-select",
  "vehicle-registration",
  "vehicle-confirm",
]);

export function resolveWizardPages(
  fieldGroupKeys: string[],
  options: {
    native: boolean;
    /** Keys that always start a fresh page (flushing whatever came before),
     * without being solo themselves — unlike `SOLO_FIELD_GROUP_KEYS`, keys
     * after a force-break one still bundle together up to `chunkSize`. Used
     * to split the Bil og MC flow into an images-only page (title-photos)
     * and a combined Tittel/Tilstand/Kilometerstand/Pris/Beskrivelse page
     * (description-keywords), without changing chunking for every other
     * category. Optional — omitting it preserves prior behavior exactly. */
    forceBreakBeforeKeys?: ReadonlySet<string>;
  },
): string[][] {
  if (options.native) {
    return fieldGroupKeys.map((key) => [key]);
  }
  const chunkSize = options.native ? 3 : 4;
  const forceBreakBeforeKeys = options.forceBreakBeforeKeys;

  const withoutEnds = fieldGroupKeys.filter(
    (k) => k !== "review-publish" && k !== "delivery" && k !== "location",
  );
  const hasReviewPublish = fieldGroupKeys.includes("review-publish");
  const hasDelivery = fieldGroupKeys.includes("delivery");
  const hasLocation = fieldGroupKeys.includes("location");

  const pages: string[][] = [];
  let buffer: string[] = [];
  let bufferSize = 0;
  const flush = () => {
    if (buffer.length > 0) {
      pages.push(buffer);
      buffer = [];
      bufferSize = 0;
    }
  };

  for (const key of withoutEnds) {
    if (SOLO_FIELD_GROUP_KEYS.has(key)) {
      flush();
      pages.push([key]);
    } else {
      if (forceBreakBeforeKeys?.has(key)) flush();
      buffer.push(key);
      if (!(key === "title" && buffer.at(-2) === "photos")) bufferSize += 1;
      if (bufferSize >= chunkSize) flush();
    }
  }
  flush();

  const lastPage: string[] = [];
  if (hasDelivery) lastPage.push("delivery");
  if (hasLocation) lastPage.push("location");
  if (hasReviewPublish) lastPage.push("review-publish");
  if (lastPage.length > 0) pages.push(lastPage);

  return pages;
}
