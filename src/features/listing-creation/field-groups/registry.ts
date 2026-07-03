import type { ComponentType } from "react";

import { TitlePhotos } from "./title-photos";
import { CategorySelect } from "./category-select";
import { CategoryAttributes } from "./category-attributes";
import { Condition } from "./condition";
import { PriceGroup } from "./price";
import { DescriptionKeywordsGroup } from "./description-keywords";
import { DeliveryLocation } from "./delivery-location";
import { ReviewPublishGroup } from "./review-publish";
import type { ListingFormShape, WizardSharedProps } from "./types";

/** Context passed to a field-group's `validateExtra`, mirroring what
 * `goToStep2/3` used to close over directly in ny-annonse.tsx. */
export type ValidateCtx = {
  images: WizardSharedProps["images"];
  attributes: WizardSharedProps["attributes"];
  activeModules: WizardSharedProps["activeModules"];
  missingFilters: { label_nb: string }[];
  isFree: boolean;
  priceNok: WizardSharedProps["priceNok"];
};

export type FieldGroup = {
  key: string;
  Component: ComponentType<WizardSharedProps>;
  fieldsToValidate?: (keyof ListingFormShape)[];
  validateExtra?: (
    ctx: ValidateCtx,
  ) => "SHOW_NO_IMAGE_DIALOG" | "SHOW_NO_PRICE_DIALOG" | string | null;
};

export const FIELD_GROUP_REGISTRY: Record<string, FieldGroup> = {
  "category-select": {
    key: "category-select",
    Component: CategorySelect,
    fieldsToValidate: ["category_id"],
  },
  "title-photos": {
    key: "title-photos",
    Component: TitlePhotos,
    fieldsToValidate: ["title"],
    validateExtra: (ctx) => (ctx.images.length === 0 ? "SHOW_NO_IMAGE_DIALOG" : null),
  },
  "category-attributes": {
    key: "category-attributes",
    Component: CategoryAttributes,
    fieldsToValidate: ["category_id"],
    validateExtra: (ctx) => {
      if (ctx.missingFilters.length > 0) {
        return `Fyll inn ${ctx.missingFilters.map((f) => f.label_nb).join(", ")} før du går videre.`;
      }
      for (const mod of ctx.activeModules) {
        const error = mod.validateExtra?.(ctx.attributes);
        if (error) return error;
      }
      return null;
    },
  },
  condition: {
    key: "condition",
    Component: Condition,
    fieldsToValidate: ["condition"],
  },
  price: {
    key: "price",
    Component: PriceGroup,
    fieldsToValidate: ["price_nok"],
    validateExtra: (ctx) =>
      !ctx.isFree && (ctx.priceNok === "" || ctx.priceNok === undefined)
        ? "SHOW_NO_PRICE_DIALOG"
        : null,
  },
  "description-keywords": {
    key: "description-keywords",
    Component: DescriptionKeywordsGroup,
    fieldsToValidate: ["description"],
  },
  "delivery-location": {
    key: "delivery-location",
    Component: DeliveryLocation,
  },
  "review-publish": {
    key: "review-publish",
    Component: ReviewPublishGroup,
  },
};

/** Resolves field-group keys (from a category flow) to registered field groups. */
export function fieldGroupsForKeys(keys: string[]): FieldGroup[] {
  return keys.map((k) => FIELD_GROUP_REGISTRY[k]).filter((g): g is FieldGroup => !!g);
}

/**
 * Norwegian step-indicator/next-button label per field-group key, split by
 * platform since e.g. `title-photos` and `delivery-location` read
 * differently depending on how much content shares their page. Reproduces
 * today's hardcoded labels ("Tittel"/"Detaljer"/"Beskrivelse"/"Sted"/
 * "Publiser" on native; "Bilder & tittel"/"Detaljer"/"Lokasjon" on web) for
 * the default flow.
 */
const FIELD_GROUP_LABEL_NATIVE_NB: Record<string, string> = {
  "category-select": "Kategori",
  "title-photos": "Tittel",
  "category-attributes": "Detaljer",
  condition: "Detaljer",
  price: "Detaljer",
  "description-keywords": "Beskrivelse",
  "delivery-location": "Sted",
  "review-publish": "Publiser",
};

const FIELD_GROUP_LABEL_WEB_NB: Record<string, string> = {
  "category-select": "Kategori",
  "title-photos": "Bilder & tittel",
  "category-attributes": "Detaljer",
  condition: "Detaljer",
  price: "Detaljer",
  "description-keywords": "Beskrivelse",
  "delivery-location": "Lokasjon",
  "review-publish": "Publiser",
};

/** Representative label for a wizard page, derived from its first field group. */
export function pageLabel(groups: FieldGroup[], native: boolean): string {
  const map = native ? FIELD_GROUP_LABEL_NATIVE_NB : FIELD_GROUP_LABEL_WEB_NB;
  return (groups[0] && map[groups[0].key]) || "Steg";
}

/** Norwegian admin-display labels — distinct from the step-indicator labels above (different audience/purpose). */
export const FIELD_GROUP_LABELS_NB: Record<string, string> = {
  "category-select": "Kategori",
  "title-photos": "Bilder & tittel",
  "category-attributes": "Kategoriegenskaper",
  condition: "Tilstand",
  price: "Pris",
  "description-keywords": "Beskrivelse & nøkkelord",
  "delivery-location": "Levering & sted",
  "review-publish": "Forhåndsvisning & publiser",
};

/** Field groups every flow must include — admin UI won't let these be unchecked; enforced in DB too. */
export const LOCKED_FIELD_GROUP_KEYS: string[] = [
  "title-photos",
  "category-attributes",
  "description-keywords",
  "review-publish",
];

/**
 * Groups whose position in the array is structurally fixed by
 * resolveWizardPages regardless of array order (review-publish/
 * delivery-location are always last) — no drag handle for these in the admin
 * UI, since dragging them would be visibly inconsequential. `category-select`
 * is also structurally fixed (always first) but isn't part of a category's
 * stored field_groups at all (see category-flows.ts), so it never appears in
 * this admin-facing list. `title-photos` used to be fixed-first too, but is
 * now freely reorderable so a category (e.g. Bil og MC) can put
 * `category-attributes` before it — needed so vehicle lookup fills
 * brand/model/year before the title step reads them.
 */
export const POSITION_FIXED_FIELD_GROUP_KEYS: string[] = ["review-publish", "delivery-location"];
