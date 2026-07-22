import type { ComponentType } from "react";

import { TitlePhotos } from "./title-photos";
import { CategorySelect } from "./category-select";
import { CategoryAttributes } from "./category-attributes";
import { VehicleRegistration } from "./vehicle-registration";
import { VehicleConfirm } from "./vehicle-confirm";
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
  categoryId: string;
  bilOgMcCategoryId: string | null;
  vehicleLookupResult: WizardSharedProps["vehicleLookupResult"];
  isVehicle: boolean;
  knownIssues: WizardSharedProps["knownIssues"];
  noKnownIssues: WizardSharedProps["noKnownIssues"];
  showMileage: WizardSharedProps["showMileage"];
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
  "vehicle-registration": {
    key: "vehicle-registration",
    Component: VehicleRegistration,
    fieldsToValidate: ["category_id"],
    validateExtra: (ctx) => {
      // Either a lookup succeeded (proceed to vehicle-confirm) or the user
      // manually picked a real leaf category (opted out of registered path)
      // and filled in the same required technical fields by hand.
      if (ctx.vehicleLookupResult) return null;
      if (ctx.categoryId && ctx.categoryId !== ctx.bilOgMcCategoryId) {
        if (ctx.missingFilters.length > 0) {
          return `Fyll inn ${ctx.missingFilters.map((f) => f.label_nb).join(", ")} før du går videre.`;
        }
        return null;
      }
      return "Slå opp registreringsnummer, eller velg kjøretøytype manuelt.";
    },
  },
  "vehicle-confirm": {
    key: "vehicle-confirm",
    Component: VehicleConfirm,
    validateExtra: (ctx) => {
      if (ctx.categoryId && ctx.categoryId !== ctx.bilOgMcCategoryId) return null;
      return "Bekreft opplysningene fra Statens vegvesen før du går videre.";
    },
  },
  "category-attributes": {
    key: "category-attributes",
    Component: CategoryAttributes,
    fieldsToValidate: ["category_id"],
    validateExtra: (ctx) => {
      // For kjøretøy er kategori og Egenskaper allerede bekreftet i
      // vehicle-confirm — denne field group-en rendrer ingenting for
      // kjøretøy (se CategoryAttributes), så den skal heller ikke validere
      // noe her.
      if (ctx.isVehicle) return null;
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
    validateExtra: (ctx) => {
      // For Bil og MC, Tittel/Tilstand/Pris/Kilometerstand live on this same
      // page (see DescriptionKeywordsGroup) rather than as separate
      // "condition"/"price" field groups, so their validation moves here too.
      if (ctx.isVehicle && !ctx.isFree && (ctx.priceNok === "" || ctx.priceNok === undefined)) {
        return "SHOW_NO_PRICE_DIALOG";
      }
      if (ctx.isVehicle && ctx.showMileage) {
        const km = ctx.attributes.mileage_km;
        if (typeof km !== "number" || !Number.isFinite(km) || km < 0) {
          return "Fyll inn kilometerstand før du går videre.";
        }
      }
      if (!ctx.isVehicle) return null;
      if (ctx.noKnownIssues) return null;
      if ((ctx.knownIssues ?? "").trim().length > 0) return null;
      return "Beskriv kjente feil og mangler, eller kryss av for at kjøretøyet ikke har noen.";
    },
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
  "vehicle-registration": "Registreringsnr.",
  "vehicle-confirm": "Bekreft kjøretøy",
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
  "vehicle-registration": "Registreringsnummer",
  "vehicle-confirm": "Bekreft kjøretøy",
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
  "vehicle-registration": "Kjøretøyregistrering",
  "vehicle-confirm": "Bekreft kjøretøy (Statens vegvesen)",
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
 *
 * `vehicle-confirm` behaves similarly to `category-select`: it's injected at
 * runtime (in ny-annonse.tsx) only once a Statens Vegvesen lookup has
 * succeeded, and is never part of a category's stored `field_groups` — so it
 * never appears in the admin-facing list either. `vehicle-registration` IS a
 * normal, admin-configurable field group (seeded on the Bil og MC category's
 * flow row) since an admin may legitimately want to reorder it.
 */
export const POSITION_FIXED_FIELD_GROUP_KEYS: string[] = ["review-publish", "delivery-location"];
