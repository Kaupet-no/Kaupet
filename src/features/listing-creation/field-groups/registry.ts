import type { ComponentType } from "react";

import { PhotosGroup, TitleGroup } from "./title-photos";
import { CategorySelect } from "./category-select";
import { CategoryConfirm } from "./category-confirm";
import { CategoryAttributes } from "./category-attributes";
import { VehicleRegistration } from "./vehicle-registration";
import { Vehicle360Group } from "./vehicle-360";
import { Condition } from "./condition";
import { PriceGroup } from "./price";
import { VehicleFactsGroup } from "./vehicle-facts";
import { VehiclePriceGroup } from "./vehicle-price";
import { BoatFactsGroup } from "./boat-facts";
import { VehicleConditionGroup } from "./vehicle-condition";
import { VehicleEquipmentGroup } from "./vehicle-equipment";
import { DescriptionKeywordsGroup } from "./description-keywords";
import { DeliveryGroup, LocationGroup } from "./delivery-location";
import { ReviewPublishGroup } from "./review-publish";
import type { ListingFormShape, WizardSharedProps } from "./types";
import type { CategoryBehavior } from "@/lib/category-behavior";
import {
  LISTING_TASK_BY_FIELD_GROUP_KEY,
  type ListingTask,
} from "@/features/listing-creation/category-flows";
import { getAxleConfigOptions } from "@/lib/vehicle/vehicle-options";

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
  categories: WizardSharedProps["categories"];
  bilOgMcCategoryId: string | null;
  vehicleLookupResult: WizardSharedProps["vehicleLookupResult"];
  vehicleRegistered: WizardSharedProps["vehicleRegistered"];
  behavior: CategoryBehavior;
  knownIssues: WizardSharedProps["knownIssues"];
  noKnownIssues: WizardSharedProps["noKnownIssues"];
  showMileage: WizardSharedProps["showMileage"];
};

export type FieldGroup = {
  key: string;
  classification: "requiredToPublish" | "recommendedForTrust" | "optionalEnhancement";
  Component: ComponentType<WizardSharedProps>;
  fieldsToValidate?: (keyof ListingFormShape)[];
  validateExtra?: (
    ctx: ValidateCtx,
  ) =>
    | "SHOW_NO_IMAGE_DIALOG"
    | "SHOW_NO_PRICE_DIALOG"
    | string
    | { field: string; message: string }
    | null;
};

export const FIELD_GROUP_REGISTRY: Record<string, FieldGroup> = {
  "category-select": {
    key: "category-select",
    classification: "requiredToPublish",
    Component: CategorySelect,
    fieldsToValidate: ["category_id"],
  },
  "category-confirm": {
    key: "category-confirm",
    classification: "requiredToPublish",
    Component: CategoryConfirm,
    fieldsToValidate: ["category_id"],
  },
  photos: {
    key: "photos",
    classification: "recommendedForTrust",
    Component: PhotosGroup,
    validateExtra: (ctx) => (ctx.images.length === 0 ? "SHOW_NO_IMAGE_DIALOG" : null),
  },
  title: {
    key: "title",
    classification: "requiredToPublish",
    Component: TitleGroup,
    fieldsToValidate: ["title"],
  },
  "vehicle-registration": {
    key: "vehicle-registration",
    classification: "requiredToPublish",
    Component: VehicleRegistration,
    fieldsToValidate: ["category_id"],
    validateExtra: (ctx) => {
      // Forsvar i dybden: underkategori-rutenettet i VehicleRegistration
      // committer alltid category_id bort fra selve "Bil og MC"-roten (enten
      // direkte fra category-confirm, eller via en ett-gangs fallback-effekt
      // ved montering), så dette bør aldri faktisk treffes.
      if (ctx.categoryId === ctx.bilOgMcCategoryId) {
        return "Velg underkategori før du går videre.";
      }
      // Registrert vei fyller merke/modell fra oppslaget og lar brukeren
      // korrigere dem i samme bekreftelse. Manuell vei må fortsatt fylle dem
      // inn på siden.
      if (ctx.vehicleLookupResult) return null;
      if (ctx.vehicleRegistered) {
        return "Skriv inn registreringsnummer, eller kryss av for at kjøretøyet ikke er registrert.";
      }
      const brand = ctx.attributes.brand;
      if (typeof brand !== "string" || !brand.trim()) {
        return { field: "brand", message: "Velg merke før du går videre." };
      }
      const model = ctx.attributes.model;
      if (typeof model !== "string" || !model.trim()) {
        return { field: "model", message: "Velg modell før du går videre." };
      }
      // Bobil/campingvogn og tilhenger har hvert sitt påkrevde spørsmål SVV
      // aldri kan svare på — spørres her, uansett registrert/ikke-registrert,
      // siden reg.nr.-bekreftelsespopupen (vist av "Neste") ikke dekker dem.
      const slug = ctx.categories.find((c) => c.id === ctx.categoryId)?.slug;
      if (
        (slug === "bobil" || slug === "campingvogn") &&
        (typeof ctx.attributes.sleeping_places !== "number" || !ctx.attributes.sleeping_places)
      ) {
        return {
          field: "sleeping_places",
          message: "Fyll inn antall soveplasser før du går videre.",
        };
      }
      if (slug === "tilhenger-leaf" && ctx.attributes.eu_control_exempt == null) {
        return {
          field: "eu_control_exempt",
          message: "Svar på om hengeren er fritatt for EU-kontroll før du går videre.",
        };
      }
      if (ctx.missingFilters.length > 0) {
        return `Fyll inn ${ctx.missingFilters.map((f) => f.label_nb).join(", ")} før du går videre.`;
      }
      return null;
    },
  },
  "vehicle-360": {
    key: "vehicle-360",
    classification: "optionalEnhancement",
    Component: Vehicle360Group,
    // Ingen validering — 360-opptak er valgfritt og skal aldri blokkere.
  },
  "category-attributes": {
    key: "category-attributes",
    classification: "requiredToPublish",
    Component: CategoryAttributes,
    fieldsToValidate: ["category_id"],
    validateExtra: (ctx) => {
      // For kjøretøy er kategori og Egenskaper allerede bekreftet i
      // vehicle-registration — denne field group-en rendrer ingenting for
      // kjøretøy (se CategoryAttributes), så den skal heller ikke validere
      // noe her.
      if (!ctx.behavior.showGenericAttributes) return null;
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
    classification: "requiredToPublish",
    Component: Condition,
    fieldsToValidate: ["condition"],
  },
  price: {
    key: "price",
    classification: "recommendedForTrust",
    Component: PriceGroup,
    fieldsToValidate: ["price_nok"],
    validateExtra: (ctx) =>
      !ctx.isFree && (ctx.priceNok === "" || ctx.priceNok === undefined)
        ? "SHOW_NO_PRICE_DIALOG"
        : null,
  },
  "vehicle-facts": {
    key: "vehicle-facts",
    classification: "requiredToPublish",
    Component: VehicleFactsGroup,
    fieldsToValidate: ["title", "description"],
    validateExtra: (ctx) => {
      // Kjøretøyets "harde fakta" — Tittel, Undertittel, Kilometerstand,
      // Beskrivelse — samlet på ett eget steg (se UX-audit), atskilt fra
      // vehicle-condition. Pris (+ omregistreringsavgift) har sitt eget
      // dedikerte steg (vehicle-price) rett før forhåndsvisning.
      if (ctx.showMileage) {
        const km = ctx.attributes.mileage_km;
        if (typeof km !== "number" || !Number.isFinite(km) || km < 0) {
          return { field: "mileage_km", message: "Fyll inn kilometerstand før du går videre." };
        }
      }
      const leafSlug = ctx.categories.find((c) => c.id === ctx.categoryId)?.slug;
      if (leafSlug === "bil" || leafSlug === "atv") {
        if (typeof ctx.attributes.drive_type !== "string" || !ctx.attributes.drive_type) {
          return { field: "drive_type", message: "Velg hjuldrift før du går videre." };
        }
      }
      if (
        leafSlug === "bobil" ||
        leafSlug === "lastebil-og-henger" ||
        leafSlug === "buss-og-minibuss"
      ) {
        const options = getAxleConfigOptions(ctx.vehicleLookupResult?.axle_count ?? null);
        if (
          options.length > 0 &&
          (typeof ctx.attributes.axle_config !== "string" || !ctx.attributes.axle_config)
        ) {
          return { field: "axle_config", message: "Velg akselkombinasjon før du går videre." };
        }
      }
      return null;
    },
  },
  "vehicle-price": {
    key: "vehicle-price",
    classification: "recommendedForTrust",
    Component: VehiclePriceGroup,
    fieldsToValidate: ["price_nok"],
    validateExtra: (ctx) =>
      !ctx.isFree && (ctx.priceNok === "" || ctx.priceNok === undefined)
        ? "SHOW_NO_PRICE_DIALOG"
        : null,
  },
  "boat-facts": {
    key: "boat-facts",
    classification: "requiredToPublish",
    Component: BoatFactsGroup,
    fieldsToValidate: ["subtitle"],
    validateExtra: (ctx) => {
      // Brand/model live in this group (with autocomplete) and are hidden
      // from category-attributes, so they must be required here instead.
      const brand = ctx.attributes.brand;
      if (typeof brand !== "string" || !brand.trim()) {
        return { field: "brand", message: "Fyll inn merke før du går videre." };
      }
      const model = ctx.attributes.model;
      if (typeof model !== "string" || !model.trim()) {
        return { field: "model", message: "Fyll inn modell før du går videre." };
      }
      return null;
    },
  },
  "vehicle-condition": {
    key: "vehicle-condition",
    classification: "requiredToPublish",
    Component: VehicleConditionGroup,
    fieldsToValidate: ["condition"],
    validateExtra: (ctx) => {
      // Tilstandsvurderingen — Tilstand, kjente feil/mangler og
      // vedlikeholdshistorikk — samlet på ett eget steg (se UX-audit),
      // atskilt fra vehicle-facts og vehicle-price.
      if (ctx.noKnownIssues) return null;
      if ((ctx.knownIssues ?? "").trim().length > 0) return null;
      return {
        field: "known_issues",
        message: "Beskriv kjente feil og mangler, eller kryss av for at kjøretøyet ikke har noen.",
      };
    },
  },
  "vehicle-equipment": {
    key: "vehicle-equipment",
    classification: "optionalEnhancement",
    Component: VehicleEquipmentGroup,
    // Ingen validering — utstyrsliste er valgfri, skal ikke blokkere publisering.
  },
  "description-keywords": {
    key: "description-keywords",
    classification: "requiredToPublish",
    Component: DescriptionKeywordsGroup,
    fieldsToValidate: ["description"],
  },
  delivery: {
    key: "delivery",
    classification: "requiredToPublish",
    Component: DeliveryGroup,
  },
  location: {
    key: "location",
    classification: "recommendedForTrust",
    Component: LocationGroup,
  },
  "review-publish": {
    key: "review-publish",
    classification: "requiredToPublish",
    Component: ReviewPublishGroup,
  },
};

/** Resolves field-group keys (from a category flow) to registered field groups. */
export function fieldGroupsForKeys(keys: string[]): FieldGroup[] {
  return keys.map((k) => FIELD_GROUP_REGISTRY[k]).filter((g): g is FieldGroup => !!g);
}

/** Shared Norwegian task labels for the step indicator, page heading and the
 * web next-button. Structural category/registration pages keep their own
 * labels outside the four content tasks. */
const LISTING_TASK_LABEL_NB: Record<ListingTask, string> = {
  showcase: "Vis frem",
  searchable: "Gjør søkbar",
  trade: "Gjør handelen enkel",
  review: "Se over",
};

const STRUCTURAL_PAGE_LABEL_NB: Record<string, string> = {
  "category-select": "Kategori",
  "category-confirm": "Kategori",
  "vehicle-registration": "Registreringsnummer",
};

/** Representative label for a wizard page, derived from its semantic task. */
export function pageLabel(groups: FieldGroup[]): string {
  const key = groups[0]?.key;
  if (!key) return "Steg";
  const task = LISTING_TASK_BY_FIELD_GROUP_KEY[key];
  return task ? LISTING_TASK_LABEL_NB[task] : (STRUCTURAL_PAGE_LABEL_NB[key] ?? "Steg");
}

/** Norwegian admin-display labels — distinct from the step-indicator labels above (different audience/purpose). */
export const FIELD_GROUP_LABELS_NB: Record<string, string> = {
  "category-select": "Kategori",
  "category-confirm": "Bekreft kategori",
  "vehicle-registration": "Kjøretøyregistrering",
  "vehicle-360": "Kjøretøy: 360°-opptak",
  photos: "Bilder",
  title: "Tittel",
  "category-attributes": "Kategoriegenskaper",
  condition: "Tilstand",
  price: "Pris",
  "vehicle-facts": "Kjøretøy: Tittel, kilometerstand & beskrivelse",
  "vehicle-price": "Kjøretøy: Pris & omregistreringsavgift",
  "boat-facts": "Båt: Merke, modell & undertittel",
  "vehicle-condition": "Kjøretøy: Tilstand & historikk",
  "vehicle-equipment": "Kjøretøy: Utstyr",
  "description-keywords": "Beskrivelse & nøkkelord",
  delivery: "Levering",
  location: "Sted",
  "review-publish": "Forhåndsvisning & publiser",
};

/** Field groups every flow must include — admin UI won't let these be unchecked; enforced in DB too. */
export const LOCKED_FIELD_GROUP_KEYS: string[] = [
  "photos",
  "title",
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
 * `vehicle-registration` IS a normal, admin-configurable field group (seeded
 * on the Bil og MC category's flow row) since an admin may legitimately want
 * to reorder it.
 *
 * `vehicle-price` is runtime-injected right before `review-publish` (see
 * `withRuntimeFieldGroups`) whenever the flow has
 * `vehicle-registration`, never part of a category's stored `field_groups`,
 * so it never appears in the admin-facing list either.
 */
export const POSITION_FIXED_FIELD_GROUP_KEYS: string[] = ["review-publish", "delivery", "location"];
