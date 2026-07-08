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
import type { VehicleLookupResult } from "@/lib/vehicle-lookup.server";
import type { VehicleClassification } from "@/lib/vehicle-classification";

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

  // category
  categories: (CategoryNode & {
    name_nb: string;
    slug?: string;
    icon?: string | null;
    color?: string | null;
  })[];
  categoryLabel: string | null;
  setCategoryPickerOpen: (open: boolean) => void;
  onCategorySelect: (categoryId: string, parentId: string) => void;
  categorySuggestion: {
    category_id: string;
    parent_id: string | null;
    name_nb: string;
    parent_name_nb: string | null;
  } | null;
  categoryTouchedManually: boolean;
  applyCategorySuggestion: () => void;
  setSuggestionDismissed: (v: boolean) => void;
  setCategorySuggestion: (v: null) => void;

  // category attributes (modules)
  attributes: AttributeMap;
  onAttributesChange: (next: AttributeMap) => void;
  attributesTouched: boolean;
  activeModules: CategoryModule[];

  // vehicle-first flow (vehicle-registration / vehicle-confirm field groups)
  bilOgMcCategoryId: string | null;
  vehicleRegistered: boolean;
  setVehicleRegistered: (v: boolean) => void;
  vehicleLookupLoading: boolean;
  vehicleLookupError: string | null;
  vehicleLookupResult: VehicleLookupResult | null;
  vehicleClassification: VehicleClassification | null;
  runVehicleLookup: (registrationNumber: string) => void | Promise<void>;
  confirmVehicleData: (leafCategoryId: string) => void | Promise<void>;
  rejectVehicleLookup: () => void;

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
};
