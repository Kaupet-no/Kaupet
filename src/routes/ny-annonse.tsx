import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { type PendingImage } from "@/components/image-uploader";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { PublishedListingDialog } from "@/components/published-listing-dialog";
import { CategoryPicker } from "@/components/category-picker";
import { useAllCategoryFilters, type AttributeMap } from "@/components/attribute-fields";
import { useCategories, visibleCategories } from "@/hooks/use-categories";
import {
  effectiveFlowForCategory,
  withRuntimeFieldGroups,
  type LandingEntry,
  resolveWizardPages,
  suggestionNeedsCategoryConfirm,
} from "@/features/listing-creation/category-flows";
import {
  useCategorySelectionActions,
  useCategorySelectionState,
} from "@/features/listing-creation/use-category-selection";
import {
  usePublishListing,
  usePublishState,
} from "@/features/listing-creation/use-publish-listing";
import { useAllCategoryFlows } from "@/features/listing-creation/use-all-category-flows";
import { type WizardPage } from "@/features/listing-creation/use-listing-steps";
import {
  isReviewEditFinished,
  useWizardNavigation,
} from "@/features/listing-creation/use-wizard-navigation";
import { displayPriceNok, formatPrice } from "@/lib/format";
import { useDraftAutosave } from "@/features/listing-creation/use-draft-autosave";
import { useVehicleLookupFlow } from "@/features/listing-creation/use-vehicle-lookup-flow";
import { useLocationPicker } from "@/features/listing-creation/use-location-picker";
import { useListingTitleHints } from "@/features/listing-creation/use-listing-title-hints";
import { usePhotoSuggestion } from "@/features/listing-creation/use-photo-suggestion";
import { useVehicleTitleCategoryHint } from "@/features/listing-creation/use-vehicle-title-category-hint";
import {
  fieldGroupsForKeys,
  pageLabel,
  type FieldGroup,
  type ValidateCtx,
} from "@/features/listing-creation/field-groups/registry";
import { getCategoryBehavior } from "@/lib/category-behavior";
import {
  categoryBreadcrumb,
  getMissingRequiredFilters,
  isBoatCategory,
  vehicleCategoryGroupFor,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type CategoryNode,
} from "@/lib/category-filters";
import { VEHICLE_LEAF_SLUGS_WITHOUT_MILEAGE } from "@/lib/vehicle/vehicle-classification";
import {
  VEHICLE_LOOKUP_FILTER_KEYS,
  VEHICLE_WIZARD_MANAGED_KEYS,
} from "@/lib/vehicle/vehicle-lookup.types";
import { Turnstile } from "@marsidev/react-turnstile";
import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

import { useIsDemo } from "@/hooks/use-user-roles";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { DiscardListingDialog } from "@/features/listing-creation/discard-listing-dialog";
import { GuestPublishSheet } from "@/features/listing-creation/guest-publish-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CONDITIONS } from "@/lib/constants";
import { isNative } from "@/lib/native";

import { PublishActions } from "@/features/listing-creation/field-groups/review-publish";
import { deriveComposerImprovements } from "@/features/listing-creation/field-groups/review-publish/derive-improvements";
import type {
  ComposerReviewStatus,
  WizardSharedProps,
} from "@/features/listing-creation/field-groups/types";
import {
  buildPreviewDraft as buildPreviewDraftPure,
  type PreviewDraft,
} from "@/features/listing-creation/preview-draft-store";
import {
  EditableListingReview,
  PhoneListingPreview,
} from "@/features/listing-creation/preview-draft-view";
import type { ListingEditContextValue } from "@/features/listing-edit/edit-mode-context";
import { authResumeReturnTo, currentReturnTo } from "@/lib/auth-return";
import { blockImplicitSubmit, publishGate } from "@/features/listing-creation/publish-gate";
import { NewListingError } from "@/features/listing-creation/new-listing-error";
import { StepIndicator } from "@/features/listing-creation/step-indicator";
import { ListingComposerShell } from "@/features/listing-creation/listing-composer-shell";
import {
  FIELD_ERRORS_MESSAGE,
  visibleErrorSummary,
} from "@/features/listing-creation/error-summary";
import { ListingStrengthIndicator } from "@/features/listing-creation/composer-review";
import { useComposerHistoryBack } from "@/features/listing-creation/use-composer-history";
import { NativeComposerDeck } from "@/features/listing-creation/native-composer-deck";
import {
  resolvePublishingRequirementLabel,
  sortComposerRequirements,
  type ComposerRequirementTarget,
  type ComposerNavigationResult,
} from "@/features/listing-creation/composer-navigation";

const FullscreenLocationPicker = lazy(() =>
  import("@/components/fullscreen-location-picker").then((m) => ({
    default: m.FullscreenLocationPicker,
  })),
);

const listingSchema = z.object({
  title: z.string().trim().min(5, "Tittelen må være minst 5 tegn").max(120, "Maks 120 tegn"),
  subtitle: z.string().trim().max(80, "Maks 80 tegn").optional().or(z.literal("")),
  description: z
    .string()
    .trim()
    .min(20, "Skriv litt mer — minst 20 tegn")
    .max(4000, "Maks 4000 tegn"),
  category_id: z.string().uuid("Velg en kategori"),
  condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]).nullable().optional(),
  is_free: z.boolean(),
  can_ship: z.enum(["pickup", "ship"]).nullable().optional(),
  price_nok: z
    .union([
      z.coerce
        .number()
        .int("Prisen må være et helt tall")
        .min(0, "Prisen kan ikke være negativ")
        .max(999_999_999, "Prisen er for høy"),
      z.literal(""),
    ])
    .optional(),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
    .optional()
    .or(z.literal("")),
  city: z.string().trim().max(100, "Maks 100 tegn").optional().or(z.literal("")),
  organization_location_id: z.string().uuid().nullable().optional(),
  known_issues: z.string().trim().max(2000, "Maks 2000 tegn").optional().or(z.literal("")),
  no_known_issues: z.boolean().optional(),
  maintenance_history: z.string().trim().max(2000, "Maks 2000 tegn").optional().or(z.literal("")),
});
type ListingForm = z.infer<typeof listingSchema>;

/** Forces each of the Bil og MC vehicle-only steps onto its own page,
 * separate from title-photos (images only for vehicles) and from each
 * other: vehicle-facts (Tittel/Undertittel/Kilometerstand/Beskrivelse) and
 * vehicle-condition (Tilstand/kjente feil-mangler/vedlikeholdshistorikk) —
 * split up per the UX audit so the flow isn't one overloaded "Beskrivelse"
 * step. Deliberately excludes "vehicle-equipment" (Utstyr): that one is
 * meant to sit on the *same* page as vehicle-facts (ved siden av
 * Beskrivelse-feltet, ikke Tilstand) — so as long as it's the very next key
 * after vehicle-facts in field_groups (see `normalizeFieldGroupKeys`), it
 * joins that page's buffer instead of starting a new one. `vehicle-price`
 * doesn't need an entry here — it's in `SOLO_FIELD_GROUP_KEYS`
 * (category-flows.ts), which guarantees its own page unconditionally, on
 * every platform. See resolveWizardPages' `forceBreakBeforeKeys`. */
const VEHICLE_FORCE_BREAK_BEFORE_KEYS = new Set(["vehicle-facts", "vehicle-condition"]);

export const Route = createFileRoute("/ny-annonse")({
  validateSearch: z
    .object({
      type: z.enum(["sell", "free"]).optional(),
      title: z.string().optional(),
      start: z.enum(["bilder"]).optional(),
      resume: z.enum(["auth-publish"]).optional(),
    })
    .catch({}),
  head: () => ({
    meta: [
      { title: "Ny annonse — Kaupet.no" },
      { name: "description", content: "Legg ut en gratis annonse på Kaupet.no." },
    ],
  }),
  component: NewListingPage,
  errorComponent: NewListingError,
});

/** Hvilken del av annonsesiden (`data-preview-section` i ListingDetailView)
 * en feltgruppe redigerer — telefonrammen ved siden av skjemaet scroller til
 * delen for stegets første gruppe som har en, når steget byttes. Steg uten
 * noen (kategorivalg, registreringsnr. osv.) lar rammen stå der den er. */
const PREVIEW_SECTION_BY_GROUP_KEY: Record<string, string> = {
  photos: "photos",
  title: "title",
  price: "price",
  "vehicle-price": "price",
  "category-attributes": "facts",
  "boat-facts": "facts",
  "vehicle-facts": "facts",
  "description-keywords": "description",
  location: "location",
  delivery: "location",
};

function NewListingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [images, setImages] = useState<PendingImage[]>([]);
  const publishState = usePublishState();
  const {
    publishedId,
    publishedOpen,
    setPublishedOpen,
    promoteOpen,
    setPromoteOpen,
    uploadProgress,
    guestPublishSheetOpen,
    setGuestPublishSheetOpen,
    turnstileEnabled,
    turnstileRef,
  } = publishState;
  const authResumeHandledRef = useRef(false);
  const bypassNavigationBlockerRef = useRef(false);
  // Inline erstatning for den tidligere no-image-dialog.tsx: første "Neste"
  // uten bilder setter denne til true (viser en melding ved bildefeltet og
  // bytter Neste-knappen til "Fortsett uten bilder"), andre trykk går videre
  // — se goToNextPage.
  const [noImageConfirmPending, setNoImageConfirmPending] = useState(false);
  const [extraFieldError, setExtraFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const forwardAttemptPendingRef = useRef(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftDiscardConfirmOpen, setDraftDiscardConfirmOpen] = useState(false);
  const [attributes, setAttributes] = useState<AttributeMap>({});
  const [attributesTouched, setAttributesTouched] = useState(false);
  const native = isNative();
  const { data: isDemo = false } = useIsDemo();
  const { type: typeParam, title: titleParam, start: startParam, resume } = Route.useSearch();
  const listingType = typeParam ?? null;
  // Set once from the initial search params (mirrors the useForm defaultValues
  // pattern below — not kept in sync with titleParam afterwards): true when
  // the wizard was entered via the intent+title landing screen. That entry
  // already answered the title and starts on photos, so it (a) skips the
  // forced category-select-as-step-1 in favor of the AI-suggestion-driven
  // category-confirm step, and (b) drops the `title` group and hoists
  // `photos` to the front of whatever flow applies — see
  // effectiveFlowForCategory/applyLandingEntry in category-flows.ts.
  // `?start=bilder` is the landing screen's photos-first entry: same
  // category handling, but the title is asked on the photos page instead
  // (applyPhotosEntry).
  const [landingEntry] = useState<LandingEntry | null>(() =>
    titleParam?.trim() ? "title" : startParam === "bilder" ? "photos" : null,
  );
  const fromLanding = landingEntry !== null;
  const categorySelectionState = useCategorySelectionState();
  const {
    categoryPickerOpen,
    setCategoryPickerOpen,
    pendingCategoryChange,
    setPendingCategoryChange,
    categoryConfirmed,
    categoryEditConfirmOpen,
    setCategoryEditConfirmOpen,
    selectedParentId,
    setSelectedParentId,
    categoryTouchedManually,
    setCategoryTouchedManually,
  } = categorySelectionState;

  const { data: categories } = useCategories();

  // Hidden categories (e.g. the E2E test category) are only pickable for
  // demo/admin users — mirrors the is_hidden filtering on the browse surfaces.
  const pickableCategories = useMemo(
    () => visibleCategories(categories ?? [], isDemo),
    [categories, isDemo],
  );

  const bilOgMcCategoryId = useMemo(
    () => (categories ?? []).find((c) => c.slug === "bil-og-mc" && !c.parent_id)?.id ?? null,
    [categories],
  );

  const { data: allFilters } = useAllCategoryFilters();
  const { data: allFlows } = useAllCategoryFlows();
  const categoriesById = useMemo(() => {
    const m = new Map<
      string,
      CategoryNode & { name_nb: string; slug?: string; title_example?: string | null }
    >();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    watch,
    trigger,
    formState: { errors, touchedFields, isDirty },
  } = useForm<ListingForm>({
    resolver: zodResolver(listingSchema),
    mode: "onTouched",
    defaultValues: {
      title: titleParam ?? "",
      subtitle: "",
      description: "",
      category_id: "",
      condition: "good",
      is_free: typeParam === "free",
      can_ship: null,
      price_nok: "",
      postal_code: "",
      city: "",
      organization_location_id: null,
      known_issues: "",
      no_known_issues: false,
      maintenance_history: "",
    },
  });

  const [
    isFree,
    canShip,
    categoryId,
    condition,
    postalCode,
    city,
    title,
    subtitle,
    description,
    priceNok,
    knownIssues,
    noKnownIssues,
    organizationLocationId,
    maintenanceHistory,
  ] = useWatch({
    control,
    name: [
      "is_free",
      "can_ship",
      "category_id",
      "condition",
      "postal_code",
      "city",
      "title",
      "subtitle",
      "description",
      "price_nok",
      "known_issues",
      "no_known_issues",
      "organization_location_id",
      "maintenance_history",
    ],
  });

  const categoryName = categoryId ? categoriesById.get(categoryId)?.name_nb : undefined;
  const bilOgMcName = bilOgMcCategoryId
    ? categoriesById.get(bilOgMcCategoryId)?.name_nb
    : undefined;

  const vehicleGroup = useMemo(
    () => vehicleCategoryGroupFor(categoryId || null, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );
  const isVehicle = vehicleGroup !== null;

  const boatCategory = useMemo(
    () => isBoatCategory(categoryId || null, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );
  const behavior = useMemo(
    () => getCategoryBehavior(vehicleGroup, boatCategory),
    [vehicleGroup, boatCategory],
  );
  const missingFilters = useMemo(
    () =>
      behavior.requiresCategoryFilterValues
        ? getMissingRequiredFilters(
            categoryId || null,
            allFilters ?? [],
            categoriesById,
            attributes,
            [...VEHICLE_EQUIPMENT_FILTER_KEYS, ...behavior.requiredFilterExclusions],
          )
        : [],
    [categoryId, allFilters, categoriesById, attributes, behavior],
  );

  const showMileage = useMemo(() => {
    if (!isVehicle) return false;
    const slug = categoriesById.get(categoryId)?.slug;
    return !VEHICLE_LEAF_SLUGS_WITHOUT_MILEAGE.includes(slug as VehicleLeafSlug);
  }, [isVehicle, categoryId, categoriesById]);

  const goNextRef = useRef<() => void>(() => {});

  const {
    vehicleRegistered,
    setVehicleRegistered,
    vehicleLookupLoading,
    vehicleLookupError,
    vehicleLookupResult,
    vehicleClassification,
    vehiclePreviousClassificationMismatch,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    runVehicleLookup,
    confirmVehicleData,
    resetLookupOnReturnToRegistration,
  } = useVehicleLookupFlow({
    categoriesById,
    attributes,
    setAttributes,
    setCategoryTouchedManually,
    setSelectedParentId,
    setValue,
    goNext: () => goNextRef.current(),
  });

  // Hentet opp hit (foran baseFieldGroupKeys) fordi showCategoryConfirm
  // under trenger å vite om AI-forslaget er kjøretøy/båt før resten av
  // flyten regnes ut — se suggestionNeedsCategoryConfirm.
  const clientCategoryHint = useVehicleTitleCategoryHint({
    title,
    allFilters,
    categories,
    categoriesById,
    bilOgMcCategoryId,
  });

  // Fotoassistert kategori-/egenskapsforslag (salg), se
  // docs/decisions/2026-09-04-photo-assisted-listing-suggestions.md § 2. Én
  // instans for hele veiviseren — samtykket/tokenet dekker både bildesteget
  // (identify) og "Om tingen" (attributes), se use-photo-suggestion.ts.
  const photoSuggestion = usePhotoSuggestion({ images, title });
  // Tittelbasert KI-kategoriforslag (samme Turnstile-widget som bildeforslaget)
  // først når brukeren har gått forbi første steg — ikke per tastetrykk i
  // tittelen, som i Ønskes kjøpt. Satt fra `step` lenger ned (avledet state).
  const [pastFirstStep, setPastFirstStep] = useState(false);

  const {
    categorySuggestions,
    categorySuggestionLoading,
    setSuggestionDismissed,
    applyCategorySuggestion,
    similarListings,
    wtbMatch,
    keywordSuggestions,
    keywordsFetching,
    appendTagToDescription,
  } = useListingTitleHints({
    title,
    description,
    categoryId,
    categoryTouchedManually,
    setSelectedParentId,
    setCategoryTouchedManually,
    priceNok: typeof priceNok === "number" ? priceNok : undefined,
    isFree,
    attributes,
    setValue,
    clientCategoryHint,
    aiFallback: {
      enabled: pastFirstStep && photoSuggestion.enabled && !categoryId,
      getToken: async () => {
        const token = await photoSuggestion.getVerifiedToken();
        photoSuggestion.turnstileRef.current?.reset();
        return token;
      },
    },
  });

  const photoChallengeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !photoSuggestion.verificationNeeded ||
      (photoSuggestion.status !== "analyzing" &&
        photoSuggestion.status !== "verifying" &&
        photoSuggestion.status !== "verification-required" &&
        !photoSuggestion.attributeSuggestionLoading)
    )
      return;
    const frame = requestAnimationFrame(() =>
      photoChallengeRef.current?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [
    photoSuggestion.verificationNeeded,
    photoSuggestion.status,
    photoSuggestion.attributeSuggestionLoading,
  ]);

  // category-confirm holdes bare for forslag som gir en annen flyt enn
  // standard (kjøretøy/båt — se suggestionNeedsCategoryConfirm): den
  // avgjørelsen må stå fast før resten av sidene regnes ut, siden bl.a.
  // vehicle-registration er en solo-side som forutsetter avklart kategori.
  // For alle andre forslag vises kategorien i stedet som en endrebar chip
  // øverst på "Om tingen" (category-attributes) — mens forslaget ennå ikke
  // er lastet holdes steget midlertidig for å unngå å måtte bytte sidesett
  // etter at brukeren allerede har bladd forbi det.
  const suggestionCategoryIds = [
    ...categorySuggestions.map((s) => s.category_id),
    ...(clientCategoryHint ? [clientCategoryHint.category_id] : []),
  ];
  const showCategoryConfirm =
    fromLanding &&
    !categoryConfirmed &&
    (categorySuggestionLoading ||
      suggestionNeedsCategoryConfirm(suggestionCategoryIds, allFlows ?? [], categoriesById));

  const baseFieldGroupKeys = useMemo(
    () =>
      effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById, landingEntry)
        .fieldGroups,
    [categoryId, allFlows, categoriesById, landingEntry],
  );
  const boatFactsActive = baseFieldGroupKeys.includes("boat-facts");

  const vehicleAttributeHiddenKeys = [
    ...(vehicleLookupResult ? VEHICLE_LOOKUP_FILTER_KEYS : []),
    ...VEHICLE_WIZARD_MANAGED_KEYS,
    // Boat brand/model are captured (with autocomplete) by the boat-facts
    // group — hide them from the generic category-attributes rendering.
    ...(baseFieldGroupKeys.includes("boat-facts") ? ["brand", "model"] : []),
    // Utstyr-nøklene inherits from Bil og MC (see category_filters), but are
    // only meant to be filled in via the dedicated vehicle-equipment step —
    // hidden here unconditionally so a category without that step (e.g.
    // Motorsport) doesn't get them leaking into the generic attributes list.
    ...VEHICLE_EQUIPMENT_FILTER_KEYS,
  ];

  // Whether the *flow* is vehicle-shaped — true as soon as the user has
  // picked "Bil og MC" (or a descendant), regardless of whether a specific
  // leaf category (and therefore `isVehicle`, which needs a resolved
  // brand_select filter) has been determined yet. Used only to decide the
  // wizard's page count/chunking up front: `isVehicle` briefly reads false
  // while the user is still typing a registration number or hasn't picked a
  // manual leaf category, which used to undercount the step total (5) until
  // it jumped to the real count (7) once SVV/manual selection resolved a
  // leaf — a step count that visibly *grows* mid-flow reads as a bad sign to
  // most users, who are on the registered-vehicle path. Since every leaf
  // under Bil og MC goes through the same vehicle-facts/vehicle-condition/
  // vehicle-price pages regardless of registered-or-not, the page count
  // itself never actually needs to change — only `isVehicle` (which
  // still gates vehicle-specific rendering choices like condition options or
  // showMileage, evaluated later once a leaf is genuinely known) does.
  const isVehicleFlow = baseFieldGroupKeys.includes("vehicle-registration");

  // category-confirm er aldri en del av en kategoris lagrede field_groups —
  // den avhenger av live wizard-state og injiseres derfor her.
  // Se withRuntimeFieldGroups.
  //
  // category-attributes er derimot alltid en del av de lagrede field_groups
  // (DB-håndhevet, se category_flows_field_groups_required, og låst i
  // admin-UI via LOCKED_FIELD_GROUP_KEYS) — men rendrer ingenting for
  // kjøretøy (behavior.showGenericAttributes er false, se CategoryAttributes
  // og VEHICLE_BEHAVIOR). Filtrert ut her, ikke i den lagrede rekken, slik at
  // en tom "Detaljer"-side ikke likevel tar sin egen steg-plass i wizarden —
  // konstraintet/den globale låsen forblir uendret for alle andre kategorier.
  //
  // vehicle-equipment (Utstyr) er i dag kun relevant for underkategorien
  // "bil" — andre kjøretøytyper (MC, tilhenger, campingvogn, ...) kan få
  // egne utstyrsvalg senere, men frem til det finnes skal ikke Utstyr-steget
  // vises for dem (selve komponenten skjuler seg allerede når ingen
  // category_filters matcher, men det hindrer ikke en tom side fra å ta sin
  // egen steg-plass i wizarden — samme grunn som category-attributes over).
  const isCarLeaf = categoriesById.get(categoryId)?.slug === "bil";
  const fieldGroupKeys = useMemo(() => {
    let keys = withRuntimeFieldGroups(baseFieldGroupKeys, {
      showCategoryConfirm,
    });
    if (behavior.requiresDeliveryMethod && !keys.includes("delivery")) {
      const insertAt = keys.indexOf("location");
      keys = [...keys];
      keys.splice(insertAt >= 0 ? insertAt : keys.length, 0, "delivery");
    } else if (!behavior.requiresDeliveryMethod) {
      keys = keys.filter((key) => key !== "delivery");
    }
    return keys.filter(
      (key) =>
        (key !== "category-attributes" || !isVehicleFlow) &&
        (key !== "vehicle-equipment" || isCarLeaf),
    );
  }, [
    baseFieldGroupKeys,
    showCategoryConfirm,
    behavior.requiresDeliveryMethod,
    isVehicleFlow,
    isCarLeaf,
  ]);

  const pages: WizardPage[] = useMemo(
    () =>
      resolveWizardPages(fieldGroupKeys, {
        native,
        forceBreakBeforeKeys: isVehicleFlow ? VEHICLE_FORCE_BREAK_BEFORE_KEYS : undefined,
      })
        .map((keys) => ({
          groups: fieldGroupsForKeys(keys),
        }))
        // A page whose keys all resolve to nothing renders as an empty step
        // titled "Steg" (pageLabel's fallback) that the user still has to
        // click past. That happens whenever category_flows.field_groups in
        // the database names a key the registry no longer has — drop the
        // page instead of shipping a blank one.
        .filter((page) => {
          if (page.groups.length > 0) return true;
          if (import.meta.env.DEV) {
            console.warn(
              "[ny-annonse] hopper over tomt wizard-steg — ukjente field_groups-nøkler i category_flows",
            );
          }
          return false;
        }),
    [fieldGroupKeys, native, isVehicleFlow],
  );

  const {
    step,
    setStep,
    currentPage,
    goNext,
    goBack,
    isFirst,
    isLast,
    furthestStep,
    currentStepKey,
    editReviewSection,
    setReviewJumpRequested,
    returnToReviewRef,
    reviewSectionLastStepRef,
    pendingReviewFocusRef,
    pendingRestoreStepKeyRef,
  } = useWizardNavigation({
    pages,
    categoryId,
    setValidationError,
    setCategoryEditConfirmOpen,
  });
  if (pastFirstStep !== step > 1) setPastFirstStep(step > 1);
  // Intentionally kept fresh every render (not in an effect) since
  // useVehicleLookupFlow's goNext callback, constructed above
  // `pages`/`goNext`, must see the latest function the moment it's called,
  // not one render behind.
  // eslint-disable-next-line react-hooks/refs
  goNextRef.current = goNext;

  // Underkategori (Bil/MC/Tilhenger/...) er valgfri å endre uten varsel
  // helt til brukeren forlater vehicle-registration-siden (se
  // requestCategorySelect over) — deretter regnes den som "låst" og vises
  // sammen med hovedkategorien i headeren, med bekreftelse før endring
  // (samme mønster som categoryEditConfirmOpen).
  const vehicleRegPageIndex = pages.findIndex((p) =>
    p.groups.some((g) => g.key === "vehicle-registration"),
  );
  const vehicleSubcategoryLocked =
    isVehicle && vehicleRegPageIndex >= 0 && step > vehicleRegPageIndex + 1;

  // Category selection (suggestion click or manual pick) auto-advances the
  // wizard on this step — see applyCategorySelect/applySuggestedCategory —
  // so no separate Next/Back controls are needed or wanted here.
  const isCategoryConfirmPage =
    currentPage?.groups.length === 1 && currentPage.groups[0]?.key === "category-confirm";

  useComposerHistoryBack(isFirst || isCategoryConfirmPage, goBack);

  const categoryAttributesPageIndex = pages.findIndex((p) =>
    p.groups.some((g) => g.key === "category-attributes"),
  );
  const reviewFieldLabels: Record<string, string> = {
    category_id: "Kategori",
    title: "Tittel",
    subtitle: "Undertittel",
    description: "Beskrivelse",
    condition: "Tilstand",
    price_nok: "Pris",
    postal_code: "Postnummer",
    city: "Sted",
    can_ship: "Levering",
    brand: "Merke",
    model: "Modell",
    sleeping_places: "Soveplasser",
    eu_control_exempt: "EU-kontroll",
    mileage_km: "Kilometerstand",
    drive_type: "Hjuldrift",
    axle_config: "Akselkombinasjon",
    known_issues: "Kjente feil og mangler",
    maintenance_history: "Vedlikeholdshistorikk",
  };
  const reviewGroupKeyForField = (field: string) => {
    if (field === "category_id") {
      return ["category-select", "category-confirm"].find((key) =>
        pages.some((page) => page.groups.some((group) => group.key === key)),
      );
    }
    if (field.startsWith("attr-")) {
      return behavior.attributeReviewGroupKey(pages, vehicleRegistered);
    }
    const exact = pages
      .flatMap((page) => page.groups)
      .find((group) => group.fieldsToValidate?.includes(field as keyof ListingForm))?.key;
    if (exact) return exact;
    const candidates =
      field === "brand" ||
      field === "model" ||
      field === "sleeping_places" ||
      field === "eu_control_exempt"
        ? ["vehicle-registration", "boat-facts", "category-attributes"]
        : field === "mileage_km" || field === "drive_type" || field === "axle_config"
          ? ["vehicle-facts", "category-attributes"]
          : field === "postal_code" || field === "city" || field === "can_ship"
            ? ["location", "delivery"]
            : ["category-attributes", "description-keywords", "details"];
    return candidates.find((key) =>
      pages.some((page) => page.groups.some((group) => group.key === key)),
    );
  };
  const reviewSectionForGroup = (groupKey: string | undefined) =>
    groupKey === "category-select" || groupKey === "category-confirm"
      ? ("category" as const)
      : groupKey === "photos" || groupKey === "title"
        ? ("content" as const)
        : groupKey === "delivery" || groupKey === "location"
          ? ("location" as const)
          : ("details" as const);
  const publishingRequirements: (ComposerReviewStatus & ComposerRequirementTarget)[] = [];
  const requirementKeys = new Set<string>();
  let insertionOrder = 0;
  const addPublishingRequirement = ({
    key,
    label,
    field,
    groupKey: explicitGroupKey,
  }: {
    key: string;
    label: string;
    field?: string;
    groupKey?: string;
  }) => {
    if (requirementKeys.has(key)) return;
    requirementKeys.add(key);
    const groupKey = explicitGroupKey ?? (field ? reviewGroupKeyForField(field) : undefined);
    publishingRequirements.push({
      key,
      label,
      classification: "requiredToPublish",
      targetGroupKey: groupKey,
      targetField: field,
      insertionOrder: insertionOrder++,
      onAction: () => {
        editReviewSection(reviewSectionForGroup(groupKey), {
          field,
          groupKey,
        });
      },
    });
  };
  for (const [field, error] of Object.entries(errors)) {
    if (typeof error?.message === "string") {
      addPublishingRequirement({
        key: `field-${field}`,
        label: reviewFieldLabels[field] ?? field,
        field,
      });
    }
  }
  if (extraFieldError) {
    addPublishingRequirement({
      key: `field-${extraFieldError.field}`,
      label: reviewFieldLabels[extraFieldError.field] ?? extraFieldError.field,
      field: extraFieldError.field,
    });
  }
  const schemaResult = listingSchema.safeParse({
    title,
    subtitle,
    description,
    category_id: categoryId,
    condition,
    is_free: isFree,
    can_ship: canShip,
    price_nok: priceNok,
    postal_code: postalCode,
    city,
    known_issues: knownIssues,
    no_known_issues: !!noKnownIssues,
    maintenance_history: maintenanceHistory,
  });
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      const field = issue.path[0];
      if (typeof field !== "string") continue;

      addPublishingRequirement({
        key: `field-${field}`,
        label: reviewFieldLabels[field] ?? field,
        field,
      });
    }
  }
  for (const filter of missingFilters) {
    addPublishingRequirement({
      key: `filter-${filter.key}`,
      label: filter.label_nb,
      field: `attr-${filter.key}`,
    });
  }
  const publishingValidationContext = {
    images,
    attributes,
    boatFactsActive,
    missingFilters,
    isFree,
    priceNok,
    categoryId,
    categories: pickableCategories,
    bilOgMcCategoryId,
    vehicleLookupResult,
    vehicleRegistered,
    behavior,
    knownIssues,
    noKnownIssues: !!noKnownIssues,
    showMileage,
    canShip,
  };
  const missingFilterMessage =
    missingFilters.length > 0
      ? `Fyll inn ${missingFilters.map((filter) => filter.label_nb).join(", ")} før du går videre.`
      : null;
  for (const group of fieldGroupsForKeys(fieldGroupKeys)) {
    const result = group.validateExtra?.(publishingValidationContext);
    if (
      !result ||
      result === "CONFIRM_NO_IMAGE" ||
      (typeof result === "string" && result === missingFilterMessage)
    )
      continue;
    if (typeof result === "object") {
      const resolved = resolvePublishingRequirementLabel(result, reviewFieldLabels, missingFilters);
      if (resolved.skip) continue;

      addPublishingRequirement({
        key: `field-${result.field}`,
        label: resolved.label,
        field: result.field,
        groupKey: group.key,
      });
    } else {
      addPublishingRequirement({
        key: `group-${group.key}`,
        label: result,
        groupKey: group.key,
      });
    }
  }
  const sortedPublishingRequirements = sortComposerRequirements(pages, publishingRequirements);
  const passedPublishingRequirements = sortedPublishingRequirements.filter((requirement) => {
    const pageIndex = pages.findIndex((page) =>
      page.groups.some((group) => group.key === requirement.targetGroupKey),
    );
    return pageIndex >= 0 && pageIndex + 1 < furthestStep;
  });

  const shouldBlockNav =
    publishedId === null &&
    (title.trim().length > 0 || images.length > 0 || vehicleLookupResult !== null);
  const blocker = useBlocker({
    // `next.pathname === current.pathname` skjer når et overlay (f.eks. forhåndsvisning) rydder sin egen synthetic history-oppføring med
    // `history.back()` ved lukking — se useOverlayHistory. Det er ikke en faktisk sideforlatelse, så den skal ikke trigge "endringer går tapt".
    shouldBlockFn: ({ current, next }) =>
      !bypassNavigationBlockerRef.current && shouldBlockNav && next.pathname !== current.pathname,
    withResolver: true,
    enableBeforeUnload: shouldBlockNav,
  });

  const {
    locationLoading,
    locationMethod,
    setLocationMethod,
    fullscreenMapOpen,
    setFullscreenMapOpen,
    coords,
    setCoords,
    lastEditedRef,
    markerMovedRef,
    switchToPostal,
    switchToGps,
    fetchMyLocation,
  } = useLocationPicker({ postalCode, setValue });

  const {
    draftId,
    lastSaved,
    draftSaveError,
    draftSaveConflict,
    hasDraftData,
    draftChecked,
    flushLocalDraft,
    saveDraftToSupabase,
    retryDraftAfterConflict,
    ensureDraftId,
    restoreDraft: restoreDraftFields,
    clearDraftStorage,
    discardDraft,
    dismissDraftOffer,
  } = useDraftAutosave({
    title,
    subtitle,
    description,
    selectedParentId,
    categoryId,
    condition,
    isFree,
    canShip,
    priceNok,
    postalCode,
    city,
    coords,
    isVehicle,
    attributes,
    images,
    setImages,
    knownIssues,
    noKnownIssues: !!noKnownIssues,
    organizationLocationId,
    maintenanceHistory,
    stepKey: currentStepKey,
    authenticated: !!user,
  });

  function restoreDraft() {
    setDraftDecisionPrompt(false);
    const savedStepKey = hasDraftData?.step_key;
    if (typeof savedStepKey === "string") pendingRestoreStepKeyRef.current = savedStepKey;
    void restoreDraftFields({
      setValue,
      setSelectedParentId,
      setLocationMethod,
      setAttributes,
      setCoords,
    });
  }

  // Utkasttilbudet ("Du har et tidligere utkast: ... / Fortsett / Forkast") skal vises
  // ÉN gang, ved start — ikke henge igjen på hvert steg. Så snart brukeren
  // begynner å redigere (et felt blir "dirty") eller går videre til neste
  // steg uten å ta et aktivt valg, forsvinner tilbudet for resten av
  // økten. dismissDraftOffer lar det gamle utkastet ligge urørt (verken
  // gjenopprettet eller slettet) — kun kobler fra den lagrede draftId-en,
  // slik at autolagringen som fortsetter ikke overskriver det stille.
  //
  // Dette er kun trygt når det avviste utkastet allerede har en server-kopi
  // (draftId) — da ligger dataene trygt hos Supabase uansett hva som skjer
  // lokalt etterpå. Et utkast som KUN finnes i localStorage/IndexedDB ville
  // blitt overskrevet stille av den nye annonsens autolagring (samme
  // DRAFT_KEY/bildelager) hvis vi auto-avviste det samme veien — se
  // draftDecisionRequired/goToNextPage, som i stedet tvinger et eksplisitt
  // valg før brukeren kan forlate steg 1.
  useEffect(() => {
    if (!hasDraftData || !draftId) return;
    if (isDirty || step > 1) dismissDraftOffer();
  }, [hasDraftData, draftId, isDirty, step, dismissDraftOffer]);

  // Utkast som bare finnes lokalt: brukeren må aktivt velge Fortsett/Forkast
  // før hen forlater steg 1 — se blokkeringen i goToNextPage.
  const draftDecisionRequired = !!hasDraftData && !draftId;
  const [draftDecisionPrompt, setDraftDecisionPrompt] = useState(false);
  const continueDraftButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (resume !== "auth-publish" || !user || !hasDraftData || authResumeHandledRef.current) {
      return;
    }
    authResumeHandledRef.current = true;
    restoreDraft();
    setReviewJumpRequested(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, user?.id, hasDraftData]);
  async function startNewListing() {
    setDraftDecisionPrompt(false);
    setDraftDiscardConfirmOpen(false);
    await discardDraft();
  }

  // (Effekten blir her og ikke i useWizardNavigation: den må kjøre ETTER
  // auth-resume-effekten over i samme commit, siden den setter
  // pendingRestoreStepKeyRef.)
  // `pages` only reflects the restored category/attributes once the field
  // updates above have propagated through state, so the step jump has to
  // wait for `pages` to catch up rather than happening inline in
  // restoreDraft() — mirrors the reviewJumpRequested pattern above.
  useEffect(() => {
    const targetKey = pendingRestoreStepKeyRef.current;
    if (!targetKey) return;
    const pageIndex = pages.findIndex((page) => page.groups.some((g) => g.key === targetKey));
    if (pageIndex >= 0) {
      setStep(pageIndex + 1);
      pendingRestoreStepKeyRef.current = null;
    }
  }, [pages, setStep, pendingRestoreStepKeyRef]);

  // Pre-fill location from user's last listing (if no draft)
  useEffect(() => {
    if (!user || hasDraftData) return;
    void (async () => {
      const { data } = await supabase
        .from("listings")
        .select("postal_code, city")
        .eq("seller_id", user.id)
        .not("postal_code", "is", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.postal_code) {
        setValue("postal_code", data.postal_code);
        setLocationMethod("postal");
      }
      if (data?.city) setValue("city", data.city);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Samme kontekst som stegvalidatorene får ved «Neste» — også brukt til å
  // kjøre den blokkerende validatoren på nytt, så feilbanneret forsvinner når
  // brukeren har rettet feilen.
  const validateCtx: ValidateCtx = {
    images,
    attributes,
    boatFactsActive,
    missingFilters,
    isFree,
    priceNok,
    categoryId,
    categories: pickableCategories,
    bilOgMcCategoryId,
    vehicleLookupResult,
    vehicleRegistered,
    behavior,
    knownIssues,
    noKnownIssues: !!noKnownIssues,
    showMileage,
    canShip,
  };
  // Knyttet til meldingen den satte: en senere, annen melding (f.eks. ved
  // publisering) skal ikke vurderes av denne validatoren.
  const [blockingValidator, setBlockingValidator] = useState<{
    message: string;
    validate: NonNullable<FieldGroup["validateExtra"]>;
  } | null>(null);

  async function goToNextPage(): Promise<ComposerNavigationResult> {
    setValidationError(null);
    setBlockingValidator(null);
    const groups = currentPage?.groups ?? [];

    // Kategorien regnes som valgt idet brukeren går videre fra "Om tingen"
    // uten å ha trykket forslagschipen eksplisitt — chippen er en tydelig
    // handling (UI-guiden), ikke en skjult overskriving, men å måtte trykke
    // "Riktig" før "Neste" i tillegg ville vært dobbeltarbeid når forslaget
    // uansett er det eneste feltet peker mot. Bildeforslaget vinner, slik
    // som i chippen (CategoryAttributes' mergedSuggestions).
    const photoTop = photoSuggestion.categorySuggestions[0];
    if (
      groups.some((g) => g.key === "category-attributes") &&
      !categoryId &&
      !categoryTouchedManually
    ) {
      if (photoTop) {
        setSelectedParentId(photoTop.parent_id ?? photoTop.category_id);
        setValue("category_id", photoTop.category_id, { shouldValidate: true });
        setCategoryTouchedManually(true);
      } else if (categorySuggestions.length > 0) {
        applySuggestedCategory(categorySuggestions[0].category_id);
      }
    }

    // Et lokalt-only utkast (ingen server-id) er ikke trygt å la autolagring
    // skrive over stille — hold brukeren på steg 1 til hen har tatt et
    // eksplisitt valg om det tilbudte utkastet, i stedet for å bare varsle
    // med en toast.
    if (isFirst && draftDecisionRequired) {
      setDraftDecisionPrompt(true);
      requestAnimationFrame(() => continueDraftButtonRef.current?.focus());
      return "blocked";
    }

    // Registrert kjøretøy: oppslaget kjøres normalt fra "Bekreft"-knappen ved
    // skiltet, men Neste gjør det samme hvis brukeren hoppet over den. Vi blir
    // stående her så brukeren ser bekreftelsesmeldingen (eller feilen) under
    // skiltet før de går videre. Tomt skilt faller gjennom til
    // field-groupens egen validering.
    const onRegisteredVehicleStep =
      groups.some((g) => g.key === "vehicle-registration") && vehicleRegistered;
    if (onRegisteredVehicleStep && !vehicleLookupResult && vehicleRegNrInput.trim()) {
      await runVehicleLookup(vehicleRegNrInput);
      return "busy";
    }

    // For kjøretøy rendrer photos-steget kun bilder (title-steget rendrer
    // ikke for kjøretøy, se field-groups/registry.ts) — feltet
    // "title" fylles først på vehicle-facts-steget (VehicleTitleFields), så
    // det skal ikke valideres her, ellers blokkeres Neste stille uten
    // synlig feilmelding.
    const fields = groups
      .flatMap((g) => g.fieldsToValidate ?? [])
      .filter((f) => !(isVehicle && f === "title"));
    const valid = fields.length > 0 ? await trigger(fields, { shouldFocus: true }) : true;
    if (!valid) {
      if (
        groups.some((group) =>
          ["category-attributes", "boat-facts", "vehicle-registration"].includes(group.key),
        )
      )
        setAttributesTouched(true);
      setValidationError(FIELD_ERRORS_MESSAGE);
      return "blocked";
    }
    setExtraFieldError(null);
    for (const group of groups) {
      const result = group.validateExtra?.(validateCtx);
      if (result === "CONFIRM_NO_IMAGE") {
        if (native) continue;
        if (noImageConfirmPending) continue;
        setNoImageConfirmPending(true);
        return "blocked";
      }
      if (typeof result === "string") {
        if (group.key === "category-attributes" || group.key === "boat-facts")
          setAttributesTouched(true);
        setValidationError(result);
        setBlockingValidator({ message: result, validate: group.validateExtra! });
        return "blocked";
      }
      if (result && typeof result === "object") {
        if (
          group.key === "category-attributes" ||
          group.key === "boat-facts" ||
          group.key === "vehicle-registration" ||
          group.key === "vehicle-facts"
        )
          setAttributesTouched(true);
        setExtraFieldError(result);
        setValidationError(result.message);
        setBlockingValidator({ message: result.message, validate: group.validateExtra! });
        return "blocked";
      }
    }
    // Oppslaget skrives inn i attributes først her, når brukeren går videre.
    // Går brukeren tilbake hit etter det, beholdes oppslaget og Neste går rett
    // videre — ellers ville SVV-verdiene overskrevet rettelser gjort senere.
    if (
      onRegisteredVehicleStep &&
      vehicleLookupResult &&
      attributes.registration_number !== vehicleLookupResult.registrationNumber
    ) {
      confirmVehicleData(categoryId, vehicleGroup ?? "bil");
      return "advanced";
    }
    if (isReviewEditFinished(returnToReviewRef.current, step, reviewSectionLastStepRef.current)) {
      setReviewJumpRequested(true);
      returnToReviewRef.current = false;
      reviewSectionLastStepRef.current = null;
    } else {
      goNext();
    }
    window.scrollTo({ top: 0 });
    return "advanced";
  }

  async function attemptNextPage(): Promise<ComposerNavigationResult> {
    if (forwardAttemptPendingRef.current) return "busy";
    forwardAttemptPendingRef.current = true;
    try {
      const result = await goToNextPage();
      if (result === "blocked" && native) setValidationAttempt((attempt) => attempt + 1);
      return result;
    } finally {
      forwardAttemptPendingRef.current = false;
    }
  }

  const { mutation, publishOnce, goToPublishedListing } = usePublishListing({
    state: publishState,
    images,
    attributes,
    coords,
    draftId,
    clearDraftStorage,
    fieldGroupKeys,
    behavior,
    isVehicle,
    currentStepKey,
  });

  // Kjøretøy-tilstandsetiketter (Ny bil/Bruktbil/...) har ingen beskrivelse —
  // selvforklarende, i motsetning til de generiske (Helt ny/Som ny/...).
  const conditionDescription = isVehicle
    ? undefined
    : CONDITIONS.find((c) => c.value === condition)?.description;

  const parsedPriceNok =
    typeof priceNok === "number"
      ? priceNok
      : typeof priceNok === "string" && priceNok.replace(/[^\d]/g, "")
        ? Number(priceNok.replace(/[^\d]/g, ""))
        : NaN;
  const categorySlug = categoryId ? (categoriesById.get(categoryId)?.slug ?? null) : null;
  const validPriceNok =
    Number.isFinite(parsedPriceNok) && parsedPriceNok >= 0 ? parsedPriceNok : null;
  const listingPreviewPriceNok = displayPriceNok({
    category_slug: categorySlug,
    price_nok: validPriceNok,
    attributes,
  });
  const previewPrice = isFree
    ? "Gis bort"
    : listingPreviewPriceNok != null
      ? formatPrice({ price_nok: listingPreviewPriceNok, is_free: false })
      : null;

  const savedTimeLabel = lastSaved
    ? `Utkast lagret kl. ${lastSaved.getHours().toString().padStart(2, "0")}:${lastSaved.getMinutes().toString().padStart(2, "0")}`
    : null;
  const restorableDraftTitle =
    typeof hasDraftData?.title === "string" && hasDraftData.title.trim()
      ? hasDraftData.title.trim()
      : "Utkast";
  // fromLanding-brukere kommer inn med en ny tittel fra velgeren
  // (titleParam) — hvis den ikke matcher det lagrede utkastet, er dette et
  // reelt valg mellom to annonser, ikke bare "fortsett der du slapp".
  const draftTitleConflict =
    fromLanding &&
    !!titleParam?.trim() &&
    !!hasDraftData &&
    restorableDraftTitle.trim().toLowerCase() !== titleParam.trim().toLowerCase();

  // Derived label for the category picker button
  const categoryLabel = categoryId ? categoryBreadcrumb(categoryId, categoriesById) || null : null;

  function buildPreviewDraft(): PreviewDraft {
    return buildPreviewDraftPure({
      title,
      subtitle,
      description,
      isFree,
      validPriceNok,
      fieldGroupKeys,
      condition,
      requiresDeliveryMethod: behavior.requiresDeliveryMethod,
      canShip,
      city,
      postalCode,
      coords,
      isVehicle,
      knownIssues,
      noKnownIssues,
      maintenanceHistory,
      categoryId,
      categoryNode: categoryId ? categoriesById.get(categoryId) : undefined,
      images,
      attributes,
    });
  }

  /** Se over-steget redigerer annonsesiden direkte (eierens redigeringsmodus
   * i ListingDetailView) — her lagres hver endring i utkastet i stedet for i
   * databasen. Bilder, kategori, registreringsnummer og sted hopper tilbake
   * til sine steg: utkastets bilder er lokale, og de andre har egne flyter. */
  const draftEditContext: ListingEditContextValue = {
    editMode: true,
    listingId: "draft",
    behavior,
    fieldStatus: {},
    saveField: async (patch) => {
      const opts = { shouldDirty: true, shouldValidate: true };
      switch (patch.group) {
        case "title":
          setValue("title", patch.title, opts);
          break;
        case "subtitle":
          setValue("subtitle", patch.subtitle ?? "", opts);
          break;
        case "description":
          setValue("description", patch.description, opts);
          break;
        case "condition":
          setValue("condition", patch.condition as ListingForm["condition"], opts);
          break;
        case "price":
          setValue("is_free", patch.is_free, opts);
          setValue("price_nok", patch.price_nok ?? "", opts);
          break;
        case "delivery":
          setValue(
            "can_ship",
            patch.can_ship == null ? null : patch.can_ship ? "ship" : "pickup",
            opts,
          );
          break;
        case "vehicle-condition":
          setValue("known_issues", patch.known_issues ?? "", opts);
          setValue("no_known_issues", patch.no_known_issues, opts);
          setValue("maintenance_history", patch.maintenance_history ?? "", opts);
          break;
        case "attributes":
          setAttributes(patch.attributes as AttributeMap);
          break;
        // "location" og "category" når aldri hit: openLocationEditor og
        // openCategoryModal under hopper til stegene i stedet.
      }
    },
    openVehicleLookupModal: () =>
      editReviewSection("content", { groupKey: "vehicle-registration", reviewAnchor: "title" }),
    openCategoryModal: () => editReviewSection("category"),
    openLocationEditor: () =>
      editReviewSection("location", {
        groupKey: "location",
        field: "postal_code",
        reviewAnchor: "location",
      }),
  };

  // Redirect to home if no type selected and no draft — entry should go through the picker dialog.
  // `draftChecked` gates this: the draft is read from localStorage in an
  // effect, so on a direct visit to /ny-annonse this would otherwise fire on
  // the first commit — while hasDraftData is still null — and bounce the user
  // off a draft they do have.
  // `opprett: true` tells the homepage to open that same picker dialog
  // immediately instead of landing on a silent homepage — see the matching
  // comment on `/` 's searchSchema.
  useEffect(() => {
    if (!draftChecked) return;
    if (listingType === null && !hasDraftData) {
      void navigate({ to: "/", search: { opprett: true } });
    }
  }, [draftChecked, listingType, hasDraftData, navigate]);

  // Nearest ancestor with a title_example wins; null → generic placeholder.
  const titleExample = useMemo(() => {
    let current = categoryId ? categoriesById.get(categoryId) : undefined;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.title_example) return current.title_example;
      current = current.parent_id ? categoriesById.get(current.parent_id) : undefined;
    }
    return null;
  }, [categoryId, categoriesById]);

  const {
    requestCategoryDeselect,
    requestCategorySelect,
    applySuggestedCategory,
    confirmPendingCategoryChange,
    handleCategoryPickerOpenChange,
    handleCategoryPickerSelect,
    cancelCategoryEditConfirm,
    confirmCategoryEdit,
  } = useCategorySelectionActions({
    state: categorySelectionState,
    categoryId,
    bilOgMcCategoryId,
    attributes,
    setAttributes,
    setAttributesTouched,
    setValue,
    currentPage,
    goToNextPage,
    applyCategorySuggestion,
    returnToReviewRef,
    reviewSectionLastStepRef,
    setReviewJumpRequested,
    setStep,
    vehicleSubcategoryLocked,
    vehicleRegPageIndex,
  });

  const sharedProps: WizardSharedProps = {
    native,
    isVehicle,
    behavior,
    showMileage,
    lockedFree: fromLanding ? (typeParam ?? null) : null,

    register,
    watch,
    setValue,
    trigger,
    errors,
    touchedFields,

    title,
    subtitle,
    description,
    categoryId,
    condition,
    isFree,
    canShip,
    priceNok,
    postalCode,
    city,
    knownIssues,
    noKnownIssues: !!noKnownIssues,
    maintenanceHistory,

    categories: pickableCategories,
    categorySlug,
    categoryLabel,
    titleExample,
    titleCollapsible:
      landingEntry === "photos" &&
      photoSuggestion.enabled &&
      photoSuggestion.status !== "unavailable",
    setCategoryPickerOpen,
    onCategorySelect: (id, parentId) => requestCategorySelect("wizard", id, parentId),
    onCategoryDeselect: requestCategoryDeselect,
    categorySuggestions,
    categorySuggestionLoading,
    categoryTouchedManually,
    applyCategorySuggestion: applySuggestedCategory,
    setSuggestionDismissed,
    attributes,
    onAttributesChange: setAttributes,
    attributesTouched,
    boatFactsActive,
    vehicleAttributeHiddenKeys,
    extraFieldError,

    bilOgMcCategoryId,
    vehicleRegistered,
    setVehicleRegistered,
    vehicleLookupLoading,
    vehicleLookupError,
    vehicleLookupResult,
    vehicleClassification,
    vehiclePreviousClassificationMismatch,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    runVehicleLookup,
    confirmVehicleData,
    resetLookupOnReturnToRegistration,

    conditionDescription,

    wtbMatch,

    keywordsFetching,
    keywordSuggestions,
    appendTagToDescription,

    similarListings,

    images,
    setImages,
    uploadProgress,
    noImageConfirmPending,
    draftId,
    ensureDraftId,

    photoSuggestionEnabled: photoSuggestion.enabled,
    photoSuggestionStatus: photoSuggestion.status,
    analyzePhotos: photoSuggestion.analyzePhotos,
    photoCategorySuggestions: photoSuggestion.categorySuggestions,
    photoTitleSuggestion: photoSuggestion.titleSuggestion,
    applyPhotoTitleSuggestion: photoSuggestion.applyTitleSuggestion,
    photoAttributesAvailable: photoSuggestion.canRequestAttributes,
    photoAttributeSuggestionLoading: photoSuggestion.attributeSuggestionLoading,
    requestPhotoAttributeSuggestions: photoSuggestion.requestAttributeSuggestions,

    locationMethod,
    setLocationMethod,
    locationLoading,
    coords,
    setCoords,
    switchToPostal,
    switchToGps,
    fetchMyLocation,
    setFullscreenMapOpen,
    markerMovedRef,
    lastEditedRef,

    previewPrice,
    mutationIsPending: mutation.isPending,
    turnstileEnabled,
    turnstileRef,
    onCancel: () => navigate({ to: "/" }),
    reviewListing: (
      <EditableListingReview
        draft={buildPreviewDraft()}
        editContext={draftEditContext}
        native={native}
        onEditImages={() =>
          editReviewSection("content", { groupKey: "photos", reviewAnchor: "photos" })
        }
      />
    ),
    onEditReviewSection: editReviewSection,
    improvementGroupKeys: fieldGroupsForKeys([
      ...fieldGroupKeys,
      ...(isVehicle ? ["vehicle-360"] : []),
    ])
      .filter((group) => group.classification !== "requiredToPublish")
      .map((group) => group.key),
    improvementGroups: fieldGroupsForKeys([
      ...fieldGroupKeys,
      ...(isVehicle ? ["vehicle-360"] : []),
    ])
      .filter((group) => group.classification !== "requiredToPublish")
      .map((group) => ({ key: group.key, classification: group.classification })),
    publishingRequirementErrors: sortedPublishingRequirements.map(
      (requirement) => requirement.label,
    ),
    publishingRequirements: sortedPublishingRequirements,
  };
  // Samme avledning som mobilens ReviewPublishGroup bruker (V3) — regnet her
  // også, siden annonsestyrken i stegraden vises gjennom hele flyten, ikke
  // bare på Se over-steget der ReviewPublishGroup selv rendres.
  // eslint-disable-next-line react-hooks/refs -- deriveComposerImprovements leser kun images/city/postalCode/groupKeys fra sharedProps, ingen ref
  const desktopImprovements = deriveComposerImprovements(sharedProps);

  const groups = currentPage?.groups ?? [];
  // Kjøretøy legger Sted og Se over på samme side, så currentStepKey (første
  // gruppe) holder ikke for å vite om ReviewPublishGroup vises.
  const isReviewPage = groups.some((g) => g.key === "review-publish");
  // Native gives the description textarea a flex-fill layout so it grows to
  // fill the remaining page height instead of a fixed row count — needed on
  // any solo native page containing it: the generic description-keywords
  // page (non-vehicle categories) and vehicle-facts (Tittel/Undertittel/
  // Kilometerstand/Beskrivelse — now includes the same DescriptionField).
  const isNativeDescriptionSoloPage =
    native &&
    groups.length === 1 &&
    (groups[0].key === "description-keywords" || groups[0].key === "vehicle-facts");
  const nextGroups = pages[step]?.groups ?? [];
  // Brukt av GuestPublishSheet: samme redirect-flyt som gate === "sign-in"
  // brukte før arket erstattet det direkte navigasjonshoppet.
  async function goToAuthFromGuestSheet(mode: "signin" | "signup") {
    if (!(await flushLocalDraft())) return;
    bypassNavigationBlockerRef.current = true;
    void navigate({
      to: "/auth",
      search: { mode, returnTo: authResumeReturnTo(currentReturnTo()) },
    });
  }
  function handleInvalidSubmit(fields: FieldErrors<ListingForm>) {
    const firstField = Object.keys(fields)[0] as keyof ListingForm | undefined;
    const pageIndex = firstField
      ? pages.findIndex((page) =>
          page.groups.some((group) => group.fieldsToValidate?.includes(firstField)),
        )
      : -1;
    if (pageIndex >= 0) {
      pendingReviewFocusRef.current = firstField ?? null;
      setStep(pageIndex + 1);
    }
    setValidationError("Rett feltene som er markert før du publiserer.");
  }
  // handleSubmit's callbacks only run later, from the form's submit event,
  // not during this render; the ref read inside them (pendingSubmitValuesRef)
  // is safe.
  const submitComposer = handleSubmit(
    // eslint-disable-next-line react-hooks/refs
    async (v) => {
      const gate = publishGate({
        hasMissingAttributes: missingFilters.length > 0,
        authenticated: !!user,
      });
      if (gate === "fill-required-attributes") {
        setAttributesTouched(true);
        pendingReviewFocusRef.current = missingFilters[0]?.key
          ? `attr-${missingFilters[0].key}`
          : null;
        if (categoryAttributesPageIndex >= 0) setStep(categoryAttributesPageIndex + 1);
        setValidationError("Fyll inn alle obligatoriske egenskaper før du publiserer.");
        return;
      }
      if (gate === "sign-in") {
        setGuestPublishSheetOpen(true);
        return;
      }
      publishOnce(v);
    },
    // eslint-disable-next-line react-hooks/refs -- callback runs only on form submit
    (fields) => {
      handleInvalidSubmit(fields);
    },
  );
  // Neste-knappen på bildesteget bytter til "Fortsett uten bilder" (samme
  // testid som den tidligere no-image-dialog.tsx sin bekreft-knapp) etter
  // det første trykket uten bilder — se goToNextPage.
  const awaitingNoImageConfirm =
    noImageConfirmPending && images.length === 0 && groups.some((g) => g.key === "photos");
  const composerFooter = (
    <>
      {!native && !isFirst && !isCategoryConfirmPage && (
        <Button type="button" variant="ghost" onClick={goBack} className="hidden lg:inline-flex">
          <ChevronLeft className="size-4" aria-hidden /> Tilbake
        </Button>
      )}
      {isCategoryConfirmPage ? null : !isLast ? (
        <Button
          type="button"
          data-testid={
            awaitingNoImageConfirm ? "continue-without-image-button" : "wizard-next-button"
          }
          disabled={vehicleLookupLoading}
          onClick={() => void attemptNextPage()}
          className={
            native
              ? "min-h-12 min-w-24 rounded-xl px-3 text-base"
              : "w-full h-14 text-base lg:h-11 lg:w-auto lg:text-sm"
          }
        >
          {vehicleLookupLoading ? (
            "Slår opp kjøretøy…"
          ) : (
            <>
              {awaitingNoImageConfirm
                ? "Fortsett uten bilder"
                : native
                  ? "Fortsett"
                  : `Neste: ${pageLabel(nextGroups)}`}{" "}
              <ChevronRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      ) : (
        <PublishActions
          native={native}
          turnstileEnabled={turnstileEnabled}
          turnstileRef={turnstileRef}
          mutationIsPending={mutation.isPending}
          onCancel={() => navigate({ to: "/" })}
          isGuest={!user}
        />
      )}
    </>
  );
  const photoChallenge = photoSuggestion.enabled ? (
    <div ref={photoChallengeRef} className="mx-auto mt-4 w-fit max-w-full">
      {photoSuggestion.verificationNeeded && (
        <p role="status" className="mb-2 text-sm text-foreground">
          Bekreft Cloudflare-sjekken før vi henter KI-forslag.
        </p>
      )}
      <Turnstile
        // eslint-disable-next-line react-hooks/refs -- passing the ref to Turnstile, not reading its value
        ref={photoSuggestion.turnstileRef}
        siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
        options={{ appearance: "interaction-only", action: "kaupet" }}
        // eslint-disable-next-line react-hooks/refs -- callback is invoked by Turnstile after render
        onBeforeInteractive={photoSuggestion.onBeforeInteractive}
        // eslint-disable-next-line react-hooks/refs -- callback is invoked by Turnstile after render
        onSuccess={photoSuggestion.onSuccess}
      />
    </div>
  ) : undefined;

  return (
    <>
      <form onSubmit={submitComposer} onKeyDown={blockImplicitSubmit}>
        <ListingComposerShell
          title={title}
          // Kjøretøytittelen genereres av Årsmodell/Merke/Modell
          // (computeVehicleTitle) og skal ikke skrives fritt.
          onTitleChange={
            isVehicle ? undefined : (v) => setValue("title", v, { shouldValidate: true })
          }
          categoryLabel={
            fromLanding && categoryConfirmed
              ? isVehicle
                ? vehicleSubcategoryLocked && bilOgMcName && categoryName
                  ? `${bilOgMcName} › ${categoryName}`
                  : (bilOgMcName ?? categoryName)
                : categoryName
              : undefined
          }
          onEditCategory={
            fromLanding && categoryConfirmed && categoryId
              ? () => setCategoryEditConfirmOpen(true)
              : undefined
          }
          pageKey={currentStepKey}
          pageTitle={pageLabel(groups)}
          native={native}
          backLabel={isFirst ? "Avbryt" : "Tilbake"}
          onBack={
            isFirst ? () => void navigate({ to: "/" }) : isCategoryConfirmPage ? undefined : goBack
          }
          onCancel={() => void navigate({ to: "/" })}
          notice={
            hasDraftData && isFirst ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs sm:text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {draftTitleConflict ? (
                      <>
                        Du har et ulagret utkast: <strong>«{restorableDraftTitle}»</strong>.
                        Fortsett det i stedet?
                      </>
                    ) : (
                      <>
                        Du har et tidligere utkast: <strong>{restorableDraftTitle}</strong>
                      </>
                    )}
                  </p>
                  {draftDecisionPrompt && (
                    <p role="alert" aria-live="assertive" className="mt-1 text-destructive">
                      Utkastet finnes bare på denne enheten. Velg «Fortsett utkastet» eller «Forkast
                      utkastet» før du går videre, så det ikke går tapt.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    ref={continueDraftButtonRef}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="native-touch-target"
                    onClick={restoreDraft}
                  >
                    Fortsett utkastet
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="native-touch-target"
                    onClick={() => setDraftDiscardConfirmOpen(true)}
                  >
                    Forkast utkastet
                  </Button>
                </div>
              </div>
            ) : undefined
          }
          /* Stegantallet er ikke kjent før kategori er valgt (flyten er
             kategoriavhengig) — StepIndicator viser da "Steg 1" uten "av Y"
             i stedet for et tall som kan endre seg når kategorien velges. */
          progress={
            <StepIndicator
              step={step}
              pages={pages}
              flowKnown={!!categoryId}
              onSelectStep={
                categoryId
                  ? (target) => {
                      setStep(target);
                      window.scrollTo({ top: 0 });
                    }
                  : undefined
              }
            />
          }
          status={
            draftSaveConflict ? (
              <div className="mt-1 text-right text-xs">
                <p role="alert" aria-live="assertive" className="text-destructive">
                  Utkastet ble endret i en annen fane. Endringene dine er beholdt lokalt.
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => void retryDraftAfterConflict()}
                >
                  Lagre mine endringer
                </Button>
              </div>
            ) : draftSaveError ? (
              <p
                role="alert"
                aria-live="assertive"
                className="mt-1 text-right text-xs text-destructive"
              >
                Utkast ble ikke lagret
              </p>
            ) : savedTimeLabel ? (
              <p
                role="status"
                aria-live="polite"
                className="mt-1 text-right text-xs text-muted-foreground"
              >
                {savedTimeLabel}
              </p>
            ) : undefined
          }
          errorSummary={visibleErrorSummary(validationError, {
            hasFieldErrors: Object.keys(errors).length > 0,
            stillInvalid:
              blockingValidator?.message === validationError
                ? ![null, "CONFIRM_NO_IMAGE"].includes(
                    blockingValidator.validate(validateCtx) as string | null,
                  )
                : undefined,
          })}
          validationAttempt={validationAttempt}
          footer={composerFooter}
          challenge={photoChallenge}
          firstStep={isFirst}
          // På Se over-steget er hovedkolonnen allerede annonsen (N1), og
          // annonsestyrken vises inline øverst i ReviewPublishGroup — der
          // trengs verken «Forhåndsvis» eller styrken i stegraden.
          preview={
            !native && !isReviewPage ? (
              <PhoneListingPreview draft={buildPreviewDraft()} />
            ) : undefined
          }
          previewSection={groups.map((g) => PREVIEW_SECTION_BY_GROUP_KEY[g.key]).find(Boolean)}
          // Antallet mangler avhenger av kategorien — før den er valgt ville
          // tallet vært en gjetning som hopper så snart kategorien settes.
          // Mangler på steg brukeren ikke har kommet til ennå vises ikke.
          strength={
            !native &&
            !isReviewPage &&
            categoryId &&
            (passedPublishingRequirements.length > 0 ||
              sortedPublishingRequirements.length === 0) ? (
              <div data-testid="listing-strength">
                <ListingStrengthIndicator
                  inline
                  required={passedPublishingRequirements}
                  improvements={desktopImprovements}
                />
              </div>
            ) : undefined
          }
        >
          {native ? (
            <NativeComposerDeck
              onBack={isFirst || isCategoryConfirmPage ? undefined : goBack}
              onForward={attemptNextPage}
            >
              <div
                data-testid={groups[0] ? `wizard-step-${groups[0].key}` : undefined}
                className={isNativeDescriptionSoloPage ? "flex flex-col" : "space-y-6"}
                style={
                  isNativeDescriptionSoloPage
                    ? { height: "calc(var(--vvh, 100dvh) - var(--app-bottom-nav-h) - 13.75rem)" }
                    : undefined
                }
              >
                {groups.map((g) => (
                  <g.Component key={g.key} {...sharedProps} />
                ))}
              </div>
            </NativeComposerDeck>
          ) : (
            <div
              data-testid={groups[0] ? `wizard-step-${groups[0].key}` : undefined}
              className={isNativeDescriptionSoloPage ? "flex flex-col" : "space-y-6"}
            >
              {groups.map((g) => (
                <g.Component key={g.key} {...sharedProps} />
              ))}
            </div>
          )}
        </ListingComposerShell>
      </form>

      {/* Category picker bottom sheet */}
      <CategoryPicker
        open={categoryPickerOpen}
        onOpenChange={handleCategoryPickerOpenChange}
        categories={pickableCategories}
        selectedId={categoryId}
        allowSelectAny="below-root"
        onSelect={handleCategoryPickerSelect}
      />

      {/* "Endre kategori" via siden tittelen (kun for intent+title-flyten,
          etter at kategorien er bekreftet) — bekreft først, åpne så den
          vanlige manuelle kategori-sheeten over. */}
      <AlertDialog open={categoryEditConfirmOpen} onOpenChange={setCategoryEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {vehicleSubcategoryLocked ? "Bytte underkategori?" : "Bytte kategori?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {vehicleSubcategoryLocked
                ? "Informasjonen du har fylt ut om merke, modell og tekniske detaljer kan gå tapt hvis du bytter underkategori. Er du sikker?"
                : "Informasjonen du har fylt ut i annonsen kan gå tapt hvis du bytter kategori. Er du sikker?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelCategoryEditConfirm}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmCategoryEdit}
            >
              {vehicleSubcategoryLocked ? "Ja, bytt underkategori" : "Ja, bytt kategori"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm discarding category-specific data on mid-flow category change */}
      <AlertDialog
        open={!!pendingCategoryChange}
        onOpenChange={(open) => {
          if (!open) setPendingCategoryChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCategoryChange?.kind === "deselect"
                ? "Velge annen underkategori?"
                : "Bytte kategori?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Informasjonen du har fylt ut for denne kategorien går tapt hvis du{" "}
              {pendingCategoryChange?.kind === "deselect"
                ? "velger en annen underkategori"
                : "bytter"}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingCategoryChange(null)}>
              Avbryt
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmPendingCategoryChange}
            >
              {pendingCategoryChange?.kind === "deselect"
                ? "Ja, velg på nytt"
                : "Ja, bytt kategori"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={draftDiscardConfirmOpen} onOpenChange={setDraftDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forkaste utkastet?</AlertDialogTitle>
            <AlertDialogDescription>
              Det lagrede utkastet slettes fra denne enheten og serveren. Informasjonen du allerede
              har skrevet i denne annonsen beholdes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void startNewListing()}
            >
              Forkast utkastet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Cancel confirmation dialog */}
      {fullscreenMapOpen && coords && (
        <ClientOnly>
          <Suspense fallback={null}>
            <FullscreenLocationPicker
              lat={coords.lat}
              lng={coords.lng}
              onConfirm={(next) => {
                markerMovedRef.current = true;
                lastEditedRef.current = "map";
                setCoords(next);
              }}
              onClose={() => setFullscreenMapOpen(false)}
            />
          </Suspense>
        </ClientOnly>
      )}

      <DiscardListingDialog
        open={blocker.status === "blocked"}
        onReset={() => blocker.reset?.()}
        onDiscard={async () => {
          await discardDraft();
          blocker.proceed?.();
        }}
        onSaveDraft={async () => {
          if (!user) {
            if (!(await flushLocalDraft())) return false;
            blocker.proceed?.();
            return true;
          }
          setIsSavingDraft(true);
          const id = await saveDraftToSupabase();
          setIsSavingDraft(false);
          if (!id) return false;
          blocker.proceed?.();
          return true;
        }}
        isSavingDraft={isSavingDraft}
      />

      <GuestPublishSheet
        open={guestPublishSheetOpen}
        onOpenChange={setGuestPublishSheetOpen}
        onSignIn={() => void goToAuthFromGuestSheet("signin")}
        onSignUp={() => void goToAuthFromGuestSheet("signup")}
      />

      {publishedId && (
        <PublishedListingDialog
          listingId={publishedId}
          open={publishedOpen}
          onOpenChange={setPublishedOpen}
          onView={() => {
            setPublishedOpen(false);
            goToPublishedListing();
          }}
          onPromote={() => {
            setPublishedOpen(false);
            setPromoteOpen(true);
          }}
          onClose={goToPublishedListing}
        />
      )}

      {publishedId && (
        <PromoteListingDialog
          listingId={publishedId}
          open={promoteOpen}
          onOpenChange={(o) => {
            setPromoteOpen(o);
            if (!o) goToPublishedListing();
          }}
        />
      )}
    </>
  );
}
