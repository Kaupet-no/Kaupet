import type { CategoryNode } from "@/lib/category-filters";

/**
 * Ordered, reorderable, togglable field-group keys a category's flow is
 * built from (see src/features/listing-creation/field-groups/). The configured
 * order remains authoritative inside the shared task boundaries, while
 * structural and vehicle-specific solo pages stay explicit.
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

export type ListingTask = "showcase" | "searchable" | "trade" | "review";

/** Shared semantic task for every content field group. Structural groups are
 * deliberately absent because they keep their own page labels. */
export const LISTING_TASK_BY_FIELD_GROUP_KEY: Partial<Record<string, ListingTask>> = {
  photos: "showcase",
  title: "showcase",
  "vehicle-360": "showcase",
  "category-attributes": "searchable",
  "description-keywords": "searchable",
  "boat-facts": "searchable",
  "vehicle-facts": "searchable",
  "vehicle-equipment": "searchable",
  condition: "trade",
  price: "trade",
  delivery: "trade",
  location: "trade",
  "vehicle-condition": "trade",
  "vehicle-price": "trade",
  "review-publish": "review",
};

export type CategoryFlow = {
  fieldGroups: string[];
};

export type CategoryFlowRow = {
  id: string;
  category_id: string;
  field_groups: string[];
  sort_order: number;
};

const DEFAULT_FLOW: CategoryFlow = { fieldGroups: DEFAULT_FIELD_GROUPS };

export function normalizeFieldGroupKeys(keys: string[]): string[] {
  // Deduplicated (first occurrence wins): a field group asked twice in the
  // same flow means the user is asked the same question twice, which is a
  // configuration mistake in every case — cheaper to make impossible here
  // than to guard in each group.
  const normalized = [...new Set(keys)];
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
  // vehicle-equipment (Utstyr) sitter sammen med vehicle-facts (Beskrivelse-
  // siden), ikke vehicle-condition (Tilstand) — se VEHICLE_FORCE_BREAK_BEFORE_KEYS
  // i ny-annonse.tsx, som force-bryter siden før vehicle-condition, men ikke
  // før vehicle-equipment.
  const orderedVehicleGroups = ["vehicle-equipment", "vehicle-condition"].filter((key) =>
    vehicle.includes(key),
  );
  const withoutOrderedGroups = vehicle.filter((key) => !orderedVehicleGroups.includes(key));
  withoutOrderedGroups.splice(factsIndex + 1, 0, ...orderedVehicleGroups);
  return withoutOrderedGroups;
}

/**
 * Returns the effective flow (field groups) for a category: the
 * flow declared on the category itself, or the nearest ancestor's flow, or
 * the default flow if no category in the chain has one. Unlike
 * category_filters (which merges parent + child by key), a child flow row
 * overrides its parent's field_groups wholesale — a category either
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
      return prepend({ fieldGroups: normalizeFieldGroupKeys(row.field_groups) });
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
 * - `vehicle-price` right before `review-publish` — the dedicated, large-
 *   typography Pris + omregistreringsavgift step. Runtime-injected rather
 *   than a stored field group so it needs no DB
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
  if (!next.includes("vehicle-registration")) return next;
  const reviewIdx = next.indexOf("review-publish");
  const priceInsertAt = reviewIdx === -1 ? next.length : reviewIdx;
  return [...next.slice(0, priceInsertAt), "vehicle-price", ...next.slice(priceInsertAt)];
}

/** Field-group keys that always get their own solo page, wherever they land
 * in the ordered array — `category-select` is always first (see
 * prependCategorySelect); `vehicle-registration`/`vehicle-price` can land
 * anywhere in the array (admin-configurable position for the former,
 * runtime-injected for the latter), but must never be bundled
 * with unrelated groups like `condition`/`price`. */
const SOLO_FIELD_GROUP_KEYS: Record<string, true> = {
  "category-select": true,
  "category-confirm": true,
  "vehicle-registration": true,
  "vehicle-price": true,
};

/**
 * Ordinære flyter: samme fire oppgavegrenser på web og native — vis tingen,
 * gjør den søkbar, avklar handelen, se over og publiser. Kategorivalg og
 * -bekreftelse forblir strukturelle solo-sider.
 *
 * Gruppe­rekkefølgen inne på hver oppgaveside følger fortsatt den
 * konfigurerte flyten; bare de fire grensene ligger fast.
 */
function resolveTaskPages(fieldGroupKeys: string[]): string[][] {
  const taskPages: Record<ListingTask, string[]> = {
    showcase: [],
    searchable: [],
    trade: [],
    review: [],
  };
  for (const key of fieldGroupKeys) {
    const task = LISTING_TASK_BY_FIELD_GROUP_KEY[key];
    if (task) taskPages[task].push(key);
    else if (!SOLO_FIELD_GROUP_KEYS[key]) taskPages.searchable.push(key);
  }
  const pages = [
    ...(fieldGroupKeys.includes("category-select") ? [["category-select"]] : []),
    taskPages.showcase,
    ...(fieldGroupKeys.includes("category-confirm") ? [["category-confirm"]] : []),
    taskPages.searchable,
    taskPages.trade,
    taskPages.review,
  ];
  return pages.filter((groups) => groups.length > 0);
}

const VEHICLE_CHUNK_SIZE = 4;

/**
 * Bil og MC beholder sine egne, plattformspesifikke sider til de dedikerte
 * kjøretøyfasene er implementert: én gruppe per side på native, og ellers
 * grupper bunta i sider på inntil `VEHICLE_CHUNK_SIZE`.
 * `delivery`/`location`/`review-publish` trekkes alltid ut på den siste
 * siden, uansett hvor i arrayet de står.
 *
 * `forceBreakBeforeKeys` starter en ny side foran nøkkelen uten å gjøre den
 * solo — nøkler etter en slik brytes fortsatt sammen opp til chunk-grensen.
 * Brukes til å skille bildesiden (photos/title) fra vehicle-facts.
 */
function resolveVehiclePages(
  fieldGroupKeys: string[],
  options: { native: boolean; forceBreakBeforeKeys?: ReadonlySet<string> },
): string[][] {
  if (options.native) return fieldGroupKeys.map((key) => [key]);

  const endKeys = ["delivery", "location", "review-publish"];
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

  for (const key of fieldGroupKeys.filter((k) => !endKeys.includes(k))) {
    if (SOLO_FIELD_GROUP_KEYS[key]) {
      flush();
      pages.push([key]);
      continue;
    }
    if (options.forceBreakBeforeKeys?.has(key)) flush();
    buffer.push(key);
    // photos + title deler én visuell rad og teller derfor som én gruppe.
    if (!(key === "title" && buffer.at(-2) === "photos")) bufferSize += 1;
    if (bufferSize >= VEHICLE_CHUNK_SIZE) flush();
  }
  flush();

  const lastPage = endKeys.filter((key) => fieldGroupKeys.includes(key));
  if (lastPage.length > 0) pages.push(lastPage);

  return pages;
}

/** Deler en ordnet liste med aktive feltgruppenøkler i wizard-sider. */
export function resolveWizardPages(
  fieldGroupKeys: string[],
  options: {
    native: boolean;
    /** Se `resolveVehiclePages` — gjelder bare kjøretøyflyten. */
    forceBreakBeforeKeys?: ReadonlySet<string>;
  },
): string[][] {
  return fieldGroupKeys.includes("vehicle-registration")
    ? resolveVehiclePages(fieldGroupKeys, options)
    : resolveTaskPages(fieldGroupKeys);
}
