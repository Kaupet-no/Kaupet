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
  // Deduplicated (first occurrence wins): a field group asked twice in the
  // same flow means the user is asked the same question twice, which is a
  // configuration mistake in every case — cheaper to make impossible here
  // than to guard in each group.
  const normalized = [
    ...new Set(
      keys.flatMap((key) => {
        if (key === "title-photos") return ["photos", "title"];
        if (key === "delivery-location") return ["delivery", "location"];
        return [key];
      }),
    ),
  ];
  if (!normalized.includes("vehicle-registration")) return normalized;
  // description-keywords er droppet helt for kjøretøy: Beskrivelse (+
  // nøkkelord-chips) rendres nå direkte inne i vehicle-facts (Tittel,
  // Undertittel, Kilometerstand, Beskrivelse), ikke som et eget steg. Den
  // lagrede raden i DB må fortsatt inneholde nøkkelen (se
  // category_flows_field_groups_required-constrainten og
  // LOCKED_FIELD_GROUP_KEYS) — filtreres derfor bort her, ikke i databasen.
  const vehicle = normalized.filter(
    (key) => key !== "title" && key !== "delivery" && key !== "description-keywords",
  );
  const factsIndex = vehicle.indexOf("vehicle-facts");
  if (factsIndex === -1) return vehicle;
  const orderedVehicleGroups = ["vehicle-condition", "vehicle-equipment"].filter((key) =>
    vehicle.includes(key),
  );
  const withoutOrderedGroups = vehicle.filter((key) => !orderedVehicleGroups.includes(key));
  withoutOrderedGroups.splice(factsIndex + 1, 0, ...orderedVehicleGroups);
  return withoutOrderedGroups;
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
  fromLanding = false,
): CategoryFlow {
  const prepend = fromLanding ? applyLandingEntry : prependCategorySelect;
  if (!categoryId) return prepend(DEFAULT_FLOW);
  const flowsByCategoryId = new Map(allFlows.map((f) => [f.category_id, f]));
  let cur: CategoryNode | undefined = categoriesById.get(categoryId);
  while (cur) {
    const row = flowsByCategoryId.get(cur.id);
    if (row) {
      return prepend({
        fieldGroups: normalizeFieldGroupKeys(row.field_groups),
        modules: row.modules,
      });
    }
    cur = cur.parent_id ? categoriesById.get(cur.parent_id) : undefined;
  }
  return prepend(DEFAULT_FLOW);
}

function prependCategorySelect(flow: CategoryFlow): CategoryFlow {
  return { ...flow, fieldGroups: ["category-select", ...flow.fieldGroups] };
}

/**
 * Entry from the intent+title landing screen: the title is already answered
 * and photos are always step 1, whichever category flow ends up applying.
 * Both are therefore removed from wherever the stored flow put them —
 * `photos` re-added at the front, `title` dropped entirely (it stays
 * editable from the composer header instead).
 *
 * Hoisting `photos` rather than leaving it in place is what keeps the wizard
 * stable when the flow is swapped mid-session: the user picks a category on
 * step 2 (category-confirm), which replaces the whole page array while the
 * step index stays put. With `photos` first in *every* flow, step 1 is the
 * same page before and after the swap, so the images step can never reappear
 * later in a vehicle flow that happens to list it further down.
 */
function applyLandingEntry(flow: CategoryFlow): CategoryFlow {
  const rest = flow.fieldGroups.filter((key) => key !== "photos" && key !== "title");
  return { ...flow, fieldGroups: ["photos", ...rest] };
}

/**
 * Injects the field groups that can't be stored in a category's
 * `field_groups` because they depend on live wizard state, or that are
 * vehicle-only content with no admin-configurable position of their own:
 *
 * - `category-confirm` right after `photos`, while the landing-screen entry
 *   still has an unconfirmed AI category suggestion;
 * - `vehicle-360` right after `vehicle-registration`. 360°-opptak only
 *   applies to Bil og MC, so it can't live on the images step — that one is
 *   always step 1, before any category is known;
 * - `vehicle-price` right before `review-publish` — the dedicated, large-
 *   typography Pris + omregistreringsavgift step. Runtime-injected rather
 *   than a stored field group (like `vehicle-360`) so it needs no DB
 *   migration and never shows up as an admin-togglable checkbox: every
 *   vehicle flow gets it, always in the same place, always last before
 *   review/publish (`resolveWizardPages` always pulls `location`/
 *   `review-publish` onto the true final page regardless of array position,
 *   so inserting right before `review-publish` here is sufficient).
 *
 * Pure so the resulting step order is testable without mounting the wizard.
 */
export function withRuntimeFieldGroups(
  keys: string[],
  options: { showCategoryConfirm: boolean },
): string[] {
  let next = keys;
  if (options.showCategoryConfirm) {
    const photosIdx = next.indexOf("photos");
    const insertAt = photosIdx === -1 ? 0 : photosIdx + 1;
    next = [...next.slice(0, insertAt), "category-confirm", ...next.slice(insertAt)];
  }
  const regIdx = next.indexOf("vehicle-registration");
  if (regIdx === -1) return next;
  next = [...next.slice(0, regIdx + 1), "vehicle-360", ...next.slice(regIdx + 1)];
  const reviewIdx = next.indexOf("review-publish");
  const priceInsertAt = reviewIdx === -1 ? next.length : reviewIdx;
  return [...next.slice(0, priceInsertAt), "vehicle-price", ...next.slice(priceInsertAt)];
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
 * prependCategorySelect); `vehicle-registration`/`vehicle-360`/`vehicle-price`
 * can land anywhere in the array (admin-configurable position for the
 * former, runtime-injected for the latter two), but must never be bundled
 * with unrelated groups like `condition`/`price`. */
const SOLO_FIELD_GROUP_KEYS = new Set([
  "category-select",
  "category-confirm",
  "vehicle-registration",
  "vehicle-360",
  "vehicle-price",
]);

export function resolveWizardPages(
  fieldGroupKeys: string[],
  options: {
    native: boolean;
    /** Keys that always start a fresh page (flushing whatever came before),
     * without being solo themselves — unlike `SOLO_FIELD_GROUP_KEYS`, keys
     * after a force-break one still bundle together up to `chunkSize`. Used
     * to split the Bil og MC flow into an images-only page (title-photos)
     * and its own Tittel/Undertittel/Kilometerstand/Beskrivelse page
     * (vehicle-facts), without changing chunking for every other category.
     * Optional — omitting it preserves prior behavior exactly. */
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
