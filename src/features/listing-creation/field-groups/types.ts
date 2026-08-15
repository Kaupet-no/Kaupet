import type {
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
  UseFormTrigger,
  FieldErrors,
} from "react-hook-form";

import type { AttributeMap } from "@/components/attribute-fields";
import type { CategoryNode } from "@/lib/category-filters";
import type { CategoryModule } from "@/features/listing-creation/modules/registry";
import type { PendingImage } from "@/components/image-uploader";
import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.types";
import type { VehicleClassification } from "@/lib/vehicle/vehicle-classification";
import type { CategoryBehavior } from "@/lib/category-behavior";

/** Minimal shape of ny-annonse.tsx's ListingForm — kept local to avoid a circular import. */
export type ListingFormShape = {
  title: string;
  subtitle?: string | undefined;
  description: string;
  category_id: string;
  condition?: "new" | "like_new" | "good" | "acceptable" | "for_parts" | null;
  is_free: boolean;
  can_ship?: "pickup" | "ship" | "both" | null;
  price_nok?: number | "" | undefined;
  postal_code?: string | undefined;
  city?: string | undefined;
  known_issues?: string | undefined;
  no_known_issues?: boolean;
  maintenance_history?: string | undefined;
};

/**
 * Single shared props bag passed to every field-group component. Each
 * component only destructures what it needs; kept as one type (rather than
 * one per group) to minimize prop-drilling boilerplate in ny-annonse.tsx,
 * per the field-groups plan (slice 1: extraction only, no registry/validation
 * machinery yet — that's a later slice).
 */
export type WizardSharedProps = {
  native: boolean;
  /** Whether the current category is under the "Bil og MC" vehicle tree
   * (has a `brand_select` filter, per `vehicleCategoryGroupFor`). Drives the
   * kjøretøy-tilpassede varianter of category-attributes/condition/price/
   * description-keywords. */
  isVehicle: boolean;
  /** Whether to show/require the Kilometerstand field on the beskrivelse
   * step — true for motorized vehicle leaves, false for `tilhenger-leaf` and
   * `campingvogn` (no odometer). Meaningless when `isVehicle` is false. */
  showMileage: boolean;
  /** Flags derived from `isVehicle` that generic (non-vehicle-labelled) field
   * groups branch on — delivery-location and category-attributes — so those
   * branches live in one place (`getCategoryBehavior`) instead of each
   * re-deriving their own vehicle check. */
  behavior: CategoryBehavior;

  register: UseFormRegister<ListingFormShape>;
  watch: UseFormWatch<ListingFormShape>;
  setValue: UseFormSetValue<ListingFormShape>;
  trigger: UseFormTrigger<ListingFormShape>;
  errors: FieldErrors<ListingFormShape>;
  touchedFields: Partial<Record<keyof ListingFormShape, boolean>>;

  // watched form values
  title: string;
  subtitle: string | undefined;
  description: string;
  categoryId: string;
  condition: ListingFormShape["condition"];
  isFree: boolean;
  canShip: ListingFormShape["can_ship"];
  priceNok: ListingFormShape["price_nok"];
  postalCode: string | undefined;
  city: string | undefined;
  knownIssues: string | undefined;
  noKnownIssues: boolean;
  maintenanceHistory: string | undefined;

  // category
  categories: (CategoryNode & {
    name_nb: string;
    slug?: string;
    icon?: string | null;
    color?: string | null;
  })[];
  categoryLabel: string | null;
  /** Category-specific example for the title input's "F.eks. …" placeholder
   * (nearest ancestor's categories.title_example); null falls back to the
   * generic example. */
  titleExample: string | null;
  setCategoryPickerOpen: (open: boolean) => void;
  onCategorySelect: (categoryId: string, parentId: string) => void;
  /** Fired when the user re-opens an already-collapsed/highlighted category
   * grid (see CategoryPicker) to pick a different subcategory. Optional —
   * only wired where a subcategory choice can carry filled-in data that a
   * change would discard (currently vehicle-registration). */
  onCategoryDeselect?: (parentId: string) => void;
  /** 0-2 candidates — the vote-based RPC always returns a single confident
   * top match when it has one, but the AI fallback (borealis-1b) may return
   * two roughly-equally-likely categories (e.g. "Bil" vs. "Bilsport" for a
   * sports car title) instead of forcing a single guess. category-confirm
   * offers a button per candidate plus "Nei" for the full manual picker. */
  categorySuggestions: {
    category_id: string;
    parent_id: string | null;
    name_nb: string;
    parent_name_nb: string | null;
  }[];
  /** True while `suggestCategoryForTitle` is in flight — drives the
   * category-confirm step's skeleton state. */
  categorySuggestionLoading: boolean;
  categoryTouchedManually: boolean;
  /** Applies whichever of `categorySuggestions` has this category_id. */
  applyCategorySuggestion: (categoryId: string) => void;
  setSuggestionDismissed: (v: boolean) => void;
  setCategorySuggestions: (v: []) => void;

  // category attributes (modules)
  attributes: AttributeMap;
  onAttributesChange: (next: AttributeMap) => void;
  attributesTouched: boolean;
  activeModules: CategoryModule[];
  /** category_filters keys already reviewed/edited in vehicle-confirm — hidden
   * from category-attributes so the user isn't asked twice. Undefined/empty
   * outside the vehicle-first flow. */
  vehicleAttributeHiddenKeys: readonly string[] | undefined;
  /** Field-level error from the current step's `validateExtra`, set when the
   * user tried to advance and failed a non-RHF-registered field check (e.g.
   * `mileage_km`, `brand`/`model`, `known_issues`). Cleared on the next
   * validation attempt. Field groups compare `extraFieldError?.field` to
   * show an inline message next to the offending input. */
  extraFieldError: { field: string; message: string } | null;

  // vehicle-first flow (vehicle-registration / vehicle-confirm field groups)
  bilOgMcCategoryId: string | null;
  vehicleRegistered: boolean;
  setVehicleRegistered: (v: boolean) => void;
  vehicleLookupLoading: boolean;
  vehicleLookupError: string | null;
  vehicleLookupResult: VehicleLookupResult | null;
  vehicleClassification: VehicleClassification | null;
  /** Set when the same user previously looked up the same registration
   * number and got a different classification — surfaced as a soft warning
   * in vehicle-confirm (personalized plates can be transferred between
   * vehicles of a different class). */
  vehiclePreviousClassificationMismatch: { slug: string | null; lookedUpAt: string } | null;
  /** DOM node for the shared step footer's primary-action slot on the
   * vehicle-confirm page. vehicle-confirm portals its "Bekreft og fortsett"
   * button there so it lines up with "Tilbake" like every other step's
   * primary action, instead of rendering inline within the field group. */
  vehicleConfirmFooterSlot: HTMLDivElement | null;
  /** Controls the post-lookup confirm overlay (Regnr/Merke/Modell) shown
   * right after a successful lookup, before the vehicle-confirm step's
   * type-picker + detail table. */
  vehicleLookupConfirmOpen: boolean;
  setVehicleLookupConfirmOpen: (open: boolean) => void;
  /** Clears the lookup result so the user can retype the registration
   * number, without navigating away from the current step. */
  adjustVehicleRegistrationNumber: () => void;
  /** Closes the confirm overlay and advances to the vehicle-confirm step. */
  confirmVehicleLookupAndContinue: () => void | Promise<void>;
  /** Registration number as typed so far — lifted out of the field group so
   * the wizard's "Neste" button can trigger the lookup itself (the dedicated
   * "Slå opp" button was removed). */
  vehicleRegNrInput: string;
  setVehicleRegNrInput: (v: string) => void;
  runVehicleLookup: (registrationNumber: string) => Promise<boolean>;
  /** Matches the lookup's raw brand/model against approved vehicle_brands/
   * vehicle_models for the brand group implied by `leafCategoryId`. Returns
   * null if the leaf has no brand group (shouldn't happen for the 7 vehicle
   * leaves, but defensive). Lets vehicle-confirm show/resolve an unmatched
   * brand or model *before* the user commits, instead of silently. */
  matchVehicleBrandForLeaf: (leafCategoryId: string) => Promise<{
    categoryGroup: "bil" | "motorsykkel" | "moped_atv" | "bobil_campingvogn" | "henger";
    brandMatch: { id: string; name: string } | null;
    modelMatch: { id: string; name: string } | null;
  } | null>;
  confirmVehicleData: (
    leafCategoryId: string,
    resolved?: {
      brandName?: string;
      modelName?: string;
      /** User edits made inline in vehicle-confirm, overriding the raw SVV
       * lookup values for these fields before they're written to
       * `attributes`. Undefined fields fall back to the lookup's value. */
      specOverrides?: Partial<{
        year: number;
        fuel_type: string;
        transmission: string;
        drive_type: string;
        weight_kg: number;
        power_hk: number;
        tow_hitch: boolean;
        max_tow_weight_kg: number;
        seats: number;
        color: string;
        next_eu_control: string;
        eu_control_exempt: boolean;
        sleeping_places: number;
        max_total_weight_kg: number;
        length_m: number;
        imported_used: boolean;
        first_registration_date: string;
        cylinders: number;
        engine_displacement_cc: number;
        engine_code: string;
      }>;
    },
  ) => void | Promise<void>;

  // condition
  conditionDescription: string | undefined;

  // price / WTB
  wtbMatch: { count: number; maxPrice: number | null } | null | undefined;

  // description / keywords
  keywordsFetching: boolean;
  keywordSuggestions: { word: string }[] | undefined;
  appendTagToDescription: (tag: string) => void;

  // similar listings
  similarListings:
    | {
        id: string;
        title: string;
        price_nok: number | null;
        is_free: boolean;
        city: string | null;
      }[]
    | undefined;

  // images
  images: PendingImage[];
  setImages: (images: PendingImage[]) => void;
  uploadProgress: { done: number; total: number } | null;
  /** Persisted draft listing id, if the draft has been saved to Supabase yet
   * (requires a title of at least 5 characters — see `ensureDraftId`). Used
   * by the vehicle 360° QR capture panel to know which listing to attach
   * captured frames to. */
  draftId: string | null;
  /** Saves the draft to Supabase if it hasn't been saved yet (or `draftId` is
   * still null), then resolves with the id — or null if the draft can't be
   * saved yet (e.g. title too short). */
  ensureDraftId: () => Promise<string | null>;

  // location
  locationMethod: "gps" | "postal" | null;
  setLocationMethod: (m: "gps" | "postal" | null) => void;
  locationLoading: boolean;
  coords: { lat: number; lng: number } | null;
  setCoords: (c: { lat: number; lng: number } | null) => void;
  switchToPostal: () => void;
  switchToGps: () => void;
  fetchMyLocation: () => void | Promise<void>;
  setFullscreenMapOpen: (open: boolean) => void;
  markerMovedRef: { current: boolean };
  lastEditedRef: { current: "postal_code" | "city" | "map" | null };

  // review/publish
  previewPrice: string | null;
  mutationIsPending: boolean;
  turnstileEnabled: boolean;
  turnstileToken: string | null;
  setTurnstileToken: (token: string | null) => void;
  onCancel: () => void;
  onEditReviewSection: (section: "category" | "content" | "details" | "location") => void;

  /** Set from the ny-annonse.tsx `type` search param when the wizard was
   * entered via the intent+title landing screen — locks the price group's
   * "gis bort gratis" question instead of leaving it open-ended. "sell" hides
   * the checkbox (forces is_free false); "free" hides the whole price
   * question (forces is_free true). null outside that entry path (manual/
   * edit flow keeps today's checkbox). */
  lockedFree: "sell" | "free" | null;
};
