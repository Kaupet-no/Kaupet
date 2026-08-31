import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createListing } from "@/lib/listings.functions";
import { uploadListingImage, uploadListingImageThumb } from "@/lib/storage";
import { geocodeNorwayAddress } from "@/lib/geocode";
import { type PendingImage } from "@/components/image-uploader";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { PublishedListingDialog } from "@/components/published-listing-dialog";
import { CategoryPicker } from "@/components/category-picker";
import { useAllCategoryFilters, type AttributeMap } from "@/components/attribute-fields";
import { useCategories, visibleCategories } from "@/hooks/use-categories";
import {
  effectiveFlowForCategory,
  withRuntimeFieldGroups,
  resolveWizardPages,
} from "@/features/listing-creation/category-flows";
import { useAllCategoryFlows } from "@/features/listing-creation/use-all-category-flows";
import { useListingSteps, type WizardPage } from "@/features/listing-creation/use-listing-steps";
import { displayPriceNok, formatPrice } from "@/lib/format";
import { useDraftAutosave } from "@/features/listing-creation/use-draft-autosave";
import { useVehicleLookupFlow } from "@/features/listing-creation/use-vehicle-lookup-flow";
import { useLocationPicker } from "@/features/listing-creation/use-location-picker";
import { useListingTitleHints } from "@/features/listing-creation/use-listing-title-hints";
import { fieldGroupsForKeys, pageLabel } from "@/features/listing-creation/field-groups/registry";
import { getCategoryBehavior } from "@/lib/category-behavior";
import {
  categoryBreadcrumb,
  getMissingRequiredFilters,
  vehicleCategoryGroupFor,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type CategoryNode,
} from "@/lib/category-filters";
import { VEHICLE_LEAF_SLUGS_WITHOUT_MILEAGE } from "@/lib/vehicle/vehicle-classification";
import {
  VEHICLE_LOOKUP_FILTER_KEYS,
  VEHICLE_WIZARD_MANAGED_KEYS,
} from "@/lib/vehicle/vehicle-lookup.types";
import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

import { useIsDemo } from "@/hooks/use-is-demo";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { DiscardListingDialog } from "@/features/listing-creation/discard-listing-dialog";
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
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { formatErrorMessage } from "@/lib/errors";
import { CONDITIONS } from "@/lib/constants";
import { isNative } from "@/lib/native";

import {
  PublishActions,
  ReviewPreview,
} from "@/features/listing-creation/field-groups/review-publish";
import type {
  ComposerReviewEditOptions,
  ComposerReviewStatus,
  WizardSharedProps,
} from "@/features/listing-creation/field-groups/types";
import type { PreviewDraft } from "@/features/listing-creation/preview-draft-store";
import { PreviewDraftView } from "@/features/listing-creation/preview-draft-view";
import { trackProductEvent } from "@/lib/product-analytics";
import { NewListingError } from "@/features/listing-creation/new-listing-error";
import { StepIndicator } from "@/features/listing-creation/step-indicator";
import { ListingComposerShell } from "@/features/listing-creation/listing-composer-shell";
import { ComposerReviewStatuses } from "@/features/listing-creation/composer-review";
import { useComposerHistoryBack } from "@/features/listing-creation/use-composer-history";
import { NativeComposerDeck } from "@/features/listing-creation/native-composer-deck";
import { NoImageDialog } from "@/features/listing-creation/no-image-dialog";
import {
  focusComposerField,
  reviewSectionSteps,
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
  can_ship: z.enum(["pickup", "ship", "both"]).nullable().optional(),
  price_nok: z.union([z.coerce.number().int().min(0).max(999_999_999), z.literal("")]).optional(),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
    .optional()
    .or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  known_issues: z.string().trim().max(2000).optional().or(z.literal("")),
  no_known_issues: z.boolean().optional(),
  maintenance_history: z.string().trim().max(2000).optional().or(z.literal("")),
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

export const Route = createFileRoute("/_authenticated/ny-annonse")({
  validateSearch: z
    .object({
      type: z.enum(["sell", "free"]).optional(),
      title: z.string().optional(),
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

function NewListingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [images, setImages] = useState<PendingImage[]>([]);
  useEffect(() => trackProductEvent("listing_creation_started", { kind: "sell" }), []);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const pendingSubmitValuesRef = useRef<ListingForm | null>(null);
  const returnToReviewRef = useRef(false);
  const reviewSectionLastStepRef = useRef<number | null>(null);
  const pendingReviewFocusRef = useRef<string | null>(null);
  const [reviewJumpRequested, setReviewJumpRequested] = useState(false);
  const pendingRestoreStepKeyRef = useRef<string | null>(null);
  const [showNoImageDialog, setShowNoImageDialog] = useState(false);
  const [publishingStatusOpen, setPublishingStatusOpen] = useState(false);
  const [extraFieldError, setExtraFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const forwardAttemptPendingRef = useRef(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftDiscardConfirmOpen, setDraftDiscardConfirmOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<PreviewDraft | null>(null);
  const [previewNudgeOpen, setPreviewNudgeOpen] = useState(false);
  const [attributes, setAttributes] = useState<AttributeMap>({});
  const [attributesTouched, setAttributesTouched] = useState(false);
  const [pendingCategoryChange, setPendingCategoryChange] = useState<{
    id: string;
    parentId: string;
    via: "wizard" | "sheet";
    kind: "select" | "deselect";
  } | null>(null);
  const native = isNative();
  const { data: isDemo = false } = useIsDemo();
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const { type: typeParam, title: titleParam } = Route.useSearch();
  const listingType = typeParam ?? null;
  // Set once from the initial search params (mirrors the useForm defaultValues
  // pattern below — not kept in sync with titleParam afterwards): true when
  // the wizard was entered via the intent+title landing screen. That entry
  // already answered the title and starts on photos, so it (a) skips the
  // forced category-select-as-step-1 in favor of the AI-suggestion-driven
  // category-confirm step, and (b) drops the `title` group and hoists
  // `photos` to the front of whatever flow applies — see
  // effectiveFlowForCategory/applyLandingEntry in category-flows.ts.
  const [fromLanding] = useState(() => !!titleParam?.trim());
  // True once the user has confirmed a category on the category-confirm step
  // (suggestion click or manual pick) — removes "category-confirm" from
  // fieldGroupKeys below for the rest of the session, so the page it occupied
  // simply disappears: "Neste" from photos never lands on it again, and
  // "Tilbake" from the page after it goes straight to photos. Never reset to
  // false — the title-click "Endre kategori" flow (see categoryEditConfirmOpen)
  // reopens the category picker sheet directly rather than this step.
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);
  const [categoryEditConfirmOpen, setCategoryEditConfirmOpen] = useState(false);
  const [editingCategoryViaTitle, setEditingCategoryViaTitle] = useState(false);

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

  const [selectedParentId, setSelectedParentId] = useState<string>("");

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
    formState: { errors, touchedFields },
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
      can_ship: "pickup" as const,
      price_nok: "",
      postal_code: "",
      city: "",
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
      "maintenance_history",
    ],
  });

  const categoryName = categoryId ? categoriesById.get(categoryId)?.name_nb : undefined;
  const bilOgMcName = bilOgMcCategoryId
    ? categoriesById.get(bilOgMcCategoryId)?.name_nb
    : undefined;

  const missingFilters = useMemo(
    () =>
      getMissingRequiredFilters(
        categoryId || null,
        allFilters ?? [],
        categoriesById,
        attributes,
        VEHICLE_EQUIPMENT_FILTER_KEYS,
      ),
    [categoryId, allFilters, categoriesById, attributes],
  );

  const vehicleGroup = useMemo(
    () => vehicleCategoryGroupFor(categoryId || null, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );
  const isVehicle = vehicleGroup !== null;

  const showMileage = useMemo(() => {
    if (!isVehicle) return false;
    const slug = categoriesById.get(categoryId)?.slug;
    return !VEHICLE_LEAF_SLUGS_WITHOUT_MILEAGE.includes(slug as VehicleLeafSlug);
  }, [isVehicle, categoryId, categoriesById]);

  const genericAttributesActive = useMemo(
    () =>
      effectiveFlowForCategory(
        categoryId || null,
        allFlows ?? [],
        categoriesById,
        fromLanding,
      ).modules.includes("generic-attributes"),
    [categoryId, allFlows, categoriesById, fromLanding],
  );

  // Hoisted above its natural spot (near the other category-suggestion state)
  // because useVehicleLookupFlow's confirmVehicleData needs it, and that hook
  // is called here — before `pages`/`goNext` exist, since `pages` itself
  // depends on the hook's vehicleLookupResult. See goNextRef below for how
  // the (real) circular part of that is resolved.
  const [categoryTouchedManually, setCategoryTouchedManually] = useState(false);
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

  const baseFieldGroupKeys = useMemo(
    () =>
      effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById, fromLanding)
        .fieldGroups,
    [categoryId, allFlows, categoriesById, fromLanding],
  );
  const boatFactsActive = baseFieldGroupKeys.includes("boat-facts");
  const behavior = useMemo(
    () => getCategoryBehavior(vehicleGroup, boatFactsActive),
    [vehicleGroup, boatFactsActive],
  );

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
  const fieldGroupKeys = useMemo(
    () =>
      withRuntimeFieldGroups(baseFieldGroupKeys, {
        showCategoryConfirm: fromLanding && !categoryConfirmed,
      }).filter(
        (key) =>
          (key !== "category-attributes" || !isVehicleFlow) &&
          (key !== "vehicle-equipment" || isCarLeaf),
      ),
    [baseFieldGroupKeys, fromLanding, categoryConfirmed, isVehicleFlow, isCarLeaf],
  );

  const pages: WizardPage[] = useMemo(
    () =>
      resolveWizardPages(fieldGroupKeys, {
        native,
        forceBreakBeforeKeys: isVehicleFlow ? VEHICLE_FORCE_BREAK_BEFORE_KEYS : undefined,
      }).map((keys) => ({
        groups: fieldGroupsForKeys(keys),
      })),
    [fieldGroupKeys, native, isVehicleFlow],
  );

  const {
    step,
    setStep,
    currentPage,
    goNext,
    goBack: goBackStep,
    isFirst,
    isLast,
  } = useListingSteps(pages);
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

  useEffect(() => {
    if (!reviewJumpRequested) return;
    const frame = requestAnimationFrame(() => {
      setStep(pages.length);
      setReviewJumpRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pages.length, reviewJumpRequested, setStep]);

  const currentStepKey = currentPage?.groups[0]?.key ?? "unknown";
  // Category selection (suggestion click or manual pick) auto-advances the
  // wizard on this step — see applyCategorySelect/applySuggestedCategory —
  // so no separate Next/Back controls are needed or wanted here.
  const isCategoryConfirmPage =
    currentPage?.groups.length === 1 && currentPage.groups[0]?.key === "category-confirm";
  useEffect(() => {
    trackProductEvent("listing_creation_step_completed", {
      kind: "sell",
      action: "viewed",
      step: currentStepKey,
      stepNumber: step,
    });
  }, [currentStepKey, step]);

  function goBack() {
    // Mirrors the hidden Tilbake/Forrige buttons on category-confirm — this
    // is the single function behind the footer button, the shell's header
    // arrow, the native swipe deck, AND the browser/hardware back button (via
    // useComposerHistoryBack below) — this
    // is what keeps all four consistent instead of just the visible buttons.
    returnToReviewRef.current = false;
    reviewSectionLastStepRef.current = null;
    pendingReviewFocusRef.current = null;
    trackProductEvent("listing_creation_step_completed", {
      kind: "sell",
      action: "back",
      step: currentStepKey,
      stepNumber: step,
    });
    goBackStep();
  }
  useComposerHistoryBack(isFirst || isCategoryConfirmPage, goBack);

  /** Clear a confirmed lookup when navigation returns to registration, so
   * the registration number can be changed and looked up again. */
  const previousStepRef = useRef(step);
  useEffect(() => {
    const key = currentPage?.groups?.[0]?.key;
    if (key === "vehicle-registration" && previousStepRef.current > step) {
      resetLookupOnReturnToRegistration();
    }
    previousStepRef.current = step;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, step]);

  const categoryAttributesPageIndex = pages.findIndex((p) =>
    p.groups.some((g) => g.key === "category-attributes"),
  );
  const editReviewSection = (
    section: "category" | "content" | "details" | "location",
    options?: ComposerReviewEditOptions,
  ) => {
    trackProductEvent("listing_creation_step_completed", {
      kind: "sell",
      action: "review_fix",
      reason: section,
      step: currentStepKey,
    });
    returnToReviewRef.current = true;
    pendingReviewFocusRef.current = options?.field ?? null;
    setValidationError(null);
    const groupKeys: Record<typeof section, string[]> = {
      category: ["category-select"],
      content: ["photos", "title"],
      details: [
        "category-attributes",
        "description-keywords",
        "price",
        "boat-facts",
        "vehicle-facts",
        "vehicle-price",
      ],
      location: ["delivery", "location"],
    };
    const target =
      (options?.groupKey && reviewSectionSteps(pages, [options.groupKey])) ??
      reviewSectionSteps(pages, groupKeys[section]);
    if (!target) {
      pendingReviewFocusRef.current = null;
      // Landing-flyten har verken category-select eller (etter bekreftelse)
      // category-confirm igjen som steg, så "Endre kategori" fra
      // forhåndsvisningen har ingen side å hoppe til — den åpner samme
      // dialog som kategori-chippen i headeren i stedet.
      if (section === "category" && categoryId) {
        reviewSectionLastStepRef.current = null;
        setCategoryEditConfirmOpen(true);
        return;
      }
      returnToReviewRef.current = false;
      reviewSectionLastStepRef.current = null;
      return;
    }
    reviewSectionLastStepRef.current = target.last;
    setStep(target.first);
    if (target.first === step && options?.field) {
      requestAnimationFrame(() => {
        focusComposerField(options.field!);
        pendingReviewFocusRef.current = null;
      });
    }
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const field = pendingReviewFocusRef.current;
    if (!field) return;
    let secondFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        focusComposerField(field);
        pendingReviewFocusRef.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [currentStepKey, step]);
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
      return pages.some((page) => page.groups.some((group) => group.key === "vehicle-registration"))
        ? "vehicle-registration"
        : "category-attributes";
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
        setPublishingStatusOpen(false);
        editReviewSection(reviewSectionForGroup(groupKey), {
          field,
          groupKey,
        });
      },
    });
  };
  for (const [field, error] of Object.entries(errors)) {
    if (typeof error?.message === "string") {
      // eslint-disable-next-line react-hooks/refs -- reflesing skjer først i brukerens onAction
      addPublishingRequirement({
        key: `field-${field}`,
        label: reviewFieldLabels[field] ?? field,
        field,
      });
    }
  }
  if (extraFieldError) {
    // eslint-disable-next-line react-hooks/refs -- reflesing skjer først i brukerens onAction
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
      // eslint-disable-next-line react-hooks/refs -- reflesing skjer først i brukerens onAction
      addPublishingRequirement({
        key: `field-${field}`,
        label: reviewFieldLabels[field] ?? field,
        field,
      });
    }
  }
  for (const filter of missingFilters) {
    // eslint-disable-next-line react-hooks/refs -- reflesing skjer først i brukerens onAction
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
  };
  const missingFilterMessage =
    missingFilters.length > 0
      ? `Fyll inn ${missingFilters.map((filter) => filter.label_nb).join(", ")} før du går videre.`
      : null;
  for (const group of fieldGroupsForKeys(fieldGroupKeys)) {
    const result = group.validateExtra?.(publishingValidationContext);
    if (
      !result ||
      result === "SHOW_NO_IMAGE_DIALOG" ||
      (typeof result === "string" && result === missingFilterMessage)
    )
      continue;
    if (typeof result === "object") {
      // eslint-disable-next-line react-hooks/refs -- reflesing skjer først i brukerens onAction
      addPublishingRequirement({
        key: `field-${result.field}`,
        label: reviewFieldLabels[result.field] ?? result.field,
        field: result.field,
        groupKey: group.key,
      });
    } else {
      // eslint-disable-next-line react-hooks/refs -- reflesing skjer først i brukerens onAction
      addPublishingRequirement({
        key: `group-${group.key}`,
        label: result,
        groupKey: group.key,
      });
    }
  }
  const sortedPublishingRequirements = sortComposerRequirements(pages, publishingRequirements);
  const missingPublishingCount = sortedPublishingRequirements.length;
  const publishingStatus =
    missingPublishingCount > 0
      ? `${missingPublishingCount} ${missingPublishingCount === 1 ? "opplysning mangler" : "opplysninger mangler"}`
      : "Klar til publisering";

  const shouldBlockNav =
    publishedId === null &&
    (title.trim().length > 0 || images.length > 0 || vehicleLookupResult !== null);
  const blocker = useBlocker({
    // `next.pathname === current.pathname` skjer når et overlay (f.eks. forhåndsvisning) rydder sin egen synthetic history-oppføring med
    // `history.back()` ved lukking — se useOverlayHistory. Det er ikke en faktisk sideforlatelse, så den skal ikke trigge "endringer går tapt".
    shouldBlockFn: ({ current, next }) => shouldBlockNav && next.pathname !== current.pathname,
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
    hasDraftData,
    saveDraftToSupabase,
    ensureDraftId,
    restoreDraft: restoreDraftFields,
    clearDraftStorage,
    discardDraft,
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
    maintenanceHistory,
    stepKey: currentStepKey,
  });

  function restoreDraft() {
    trackProductEvent("listing_creation_step_completed", {
      kind: "sell",
      action: "draft_restored",
      reason: "existing",
      step: currentStepKey,
    });
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
  async function startNewListing() {
    trackProductEvent("listing_creation_step_completed", {
      kind: "sell",
      action: "draft_started",
      reason: "new",
      step: currentStepKey,
    });
    setDraftDiscardConfirmOpen(false);
    await discardDraft();
  }

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
  }, [pages, setStep]);

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

  const {
    categorySuggestions,
    categorySuggestionLoading,
    setCategorySuggestions,
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
    immediate: fromLanding,
    setValue,
  });

  async function goToNextPage(options?: {
    skipImageCheck?: boolean;
  }): Promise<ComposerNavigationResult> {
    setValidationError(null);
    const groups = currentPage?.groups ?? [];

    // "Slå opp"-knappen er fjernet — oppslaget kjøres fra selve Neste-knappen
    // når brukeren står på vehicle-registration-steget med et uslått-opp
    // regnr. Merke/modell fylles fra oppslaget og kan korrigeres i samme
    // bekreftelse, så registreringssiden krever ikke en ekstra inntasting.
    // Tomt skilt faller gjennom til field-groupens egen validering.
    if (
      groups.some((g) => g.key === "vehicle-registration") &&
      vehicleRegistered &&
      !vehicleLookupResult &&
      vehicleRegNrInput.trim()
    ) {
      // Ved treff blir vi stående på dette steget — VehicleRegistration viser
      // da en bekreftelsespopup (regnr/merke/modell/farge/årsmodell) basert
      // på at vehicleLookupResult er satt. "Ja" i popupen kaller
      // confirmVehicleData, som selv går videre til neste steg. Ved feil blir
      // vi stående her med vehicleLookupError synlig, slik at brukeren kan
      // rette registreringsnummeret.
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
      setValidationError("Rett feltene som er markert før du fortsetter.");
      trackProductEvent("listing_creation_step_completed", {
        kind: "sell",
        action: "validation_failed",
        step: currentStepKey,
        reason: "form",
      });
      return "blocked";
    }
    const validateCtx = {
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
    };
    setExtraFieldError(null);
    for (const group of groups) {
      const result = group.validateExtra?.(validateCtx);
      if (result === "SHOW_NO_IMAGE_DIALOG") {
        if (native) continue;
        if (options?.skipImageCheck) continue;
        trackProductEvent("listing_creation_step_completed", {
          kind: "sell",
          action: "validation_prompt",
          step: currentStepKey,
          reason: "image",
        });
        setShowNoImageDialog(true);
        return "blocked";
      }
      if (typeof result === "string") {
        trackProductEvent("listing_creation_step_completed", {
          kind: "sell",
          action: "validation_failed",
          step: currentStepKey,
          reason: group.key,
        });
        if (group.key === "category-attributes" || group.key === "boat-facts")
          setAttributesTouched(true);
        setValidationError(result);
        return "blocked";
      }
      if (result && typeof result === "object") {
        trackProductEvent("listing_creation_step_completed", {
          kind: "sell",
          action: "validation_failed",
          step: currentStepKey,
          reason: group.key,
        });
        if (
          group.key === "category-attributes" ||
          group.key === "boat-facts" ||
          group.key === "vehicle-registration"
        )
          setAttributesTouched(true);
        setExtraFieldError(result);
        setValidationError(result.message);
        return "blocked";
      }
    }
    trackProductEvent("listing_creation_step_completed", {
      kind: "sell",
      action: "completed",
      step: currentStepKey,
      stepNumber: step,
    });
    if (returnToReviewRef.current && step === reviewSectionLastStepRef.current) {
      setReviewJumpRequested(true);
      returnToReviewRef.current = false;
      reviewSectionLastStepRef.current = null;
    } else {
      goNext();
    }
    window.scrollTo({ top: 0 });
    return "advanced";
  }

  async function attemptNextPage(options?: {
    skipImageCheck?: boolean;
  }): Promise<ComposerNavigationResult> {
    if (forwardAttemptPendingRef.current) return "busy";
    forwardAttemptPendingRef.current = true;
    try {
      const result = await goToNextPage(options);
      if (result === "blocked" && native) setValidationAttempt((attempt) => attempt + 1);
      return result;
    } finally {
      forwardAttemptPendingRef.current = false;
    }
  }

  const mutation = useMutation({
    mutationFn: async (values: ListingForm) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Du må være logget inn.");
      const userId = userData.user.id;

      const finalCoords =
        coords ??
        (await geocodeNorwayAddress({
          postal_code: values.postal_code,
          city: values.city,
        }));

      if (turnstileEnabled && !turnstileToken)
        throw new Error("Sikkerhetskontroll ikke fullført. Prøv igjen.");

      const listing = await createListing({
        data: {
          ...(draftId ? { draftId } : {}),
          title: values.title,
          subtitle: values.subtitle || null,
          description: values.description,
          category_id: values.category_id,
          condition: fieldGroupKeys.includes("condition") ? (values.condition ?? null) : null,
          is_free: values.is_free,
          price_nok: values.is_free
            ? null
            : typeof values.price_nok === "number"
              ? values.price_nok
              : null,
          postal_code: values.postal_code || null,
          can_ship:
            fieldGroupKeys.includes("delivery") && behavior.requiresDeliveryMethod
              ? values.can_ship !== "pickup"
              : null,
          lng: finalCoords?.lng ?? null,
          known_issues: isVehicle ? values.known_issues || null : null,
          no_known_issues: isVehicle ? !!values.no_known_issues : null,
          maintenance_history: isVehicle ? values.maintenance_history || null : null,
          attributes,
          turnstileToken,
        },
      });

      // Upload images in parallel
      if (images.length > 0) {
        setUploadProgress({ done: 0, total: images.length });
        let done = 0;
        const thumbFailures: string[] = [];
        const thumbPromises: Promise<void>[] = [];
        const results = await Promise.all(
          images.map(async (img, i) => {
            const path = await uploadListingImage({
              userId,
              listingId: listing.id,
              index: i,
              file: img.file,
            });
            // Best-effort: kortvisning faller tilbake til fullstørrelsesbildet
            // hvis thumbnailen mangler, så en feil her skal ikke stoppe
            // publiseringen — men samles opp og vises til brukeren etterpå.
            thumbPromises.push(
              uploadListingImageThumb({ path, file: img.thumbFile }).catch((err) => {
                console.warn("Kunne ikke laste opp kort-thumbnail", err);
                thumbFailures.push(img.file.name);
              }),
            );
            done += 1;
            setUploadProgress({ done, total: images.length });
            return { storage_path: path, sort_order: i, caption: img.caption?.trim() || null };
          }),
        );
        await Promise.all(thumbPromises);
        if (thumbFailures.length > 0) {
          showErrorToast(`Kunne ikke laste opp forhåndsvisning for: ${thumbFailures.join(", ")}`);
        }
        setUploadProgress(null);
        const { error: imgErr } = await supabase.from("listing_images").insert(
          results.map((u) => ({
            listing_id: listing.id,
            storage_path: u.storage_path,
            sort_order: u.sort_order,
            caption: u.caption,
          })),
        );
        if (imgErr) throw imgErr;
      }

      return listing;
    },
    onSuccess: (result) => {
      clearDraftStorage();
      trackProductEvent("listing_published", {
        kind: "sell",
        action: "success",
        imageCount: images.length,
        isVehicle,
      });
      void import("@/lib/haptics").then((m) => m.hapticNotification("success"));
      showSuccessToast("Annonsen er publisert");
      setPublishedId(result.id);
      setPublishedCode(result.kaupet_code);
      setPublishedOpen(true);
    },
    onError: (err: Error) => {
      trackProductEvent("listing_creation_step_completed", {
        kind: "sell",
        action: "publish_failed",
        step: currentStepKey,
      });
      setUploadProgress(null);
      void import("@/lib/haptics").then((m) => m.hapticNotification("error"));
      showErrorToast(formatErrorMessage(err, "Kunne ikke publisere annonsen"));
    },
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
  const restorableDraftCategoryId =
    typeof hasDraftData?.category_id === "string" ? hasDraftData.category_id : null;
  const restorableDraftCategory = restorableDraftCategoryId
    ? categoryBreadcrumb(restorableDraftCategoryId, categoriesById) || null
    : null;
  const restorableDraftSavedAt =
    typeof hasDraftData?.saved_at === "number" ? new Date(hasDraftData.saved_at) : null;
  const restorableDraftSavedAtLabel =
    restorableDraftSavedAt && !Number.isNaN(restorableDraftSavedAt.getTime())
      ? restorableDraftSavedAt.toLocaleString("nb-NO", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;

  // Derived label for the category picker button
  const categoryLabel = categoryId ? categoryBreadcrumb(categoryId, categoriesById) || null : null;

  function openPreview() {
    const categoryNode = categoryId ? categoriesById.get(categoryId) : undefined;
    setPreviewDraft({
      title,
      subtitle: subtitle || null,
      description,
      priceNok: isFree ? null : validPriceNok,
      isFree,
      condition: fieldGroupKeys.includes("condition") ? (condition ?? null) : null,
      city: city || null,
      postalCode: postalCode || null,
      displayLat: coords?.lat ?? null,
      displayLng: coords?.lng ?? null,
      knownIssues: isVehicle ? knownIssues || null : null,
      noKnownIssues: isVehicle ? !!noKnownIssues : null,
      maintenanceHistory: isVehicle ? maintenanceHistory || null : null,
      category: categoryNode
        ? { name_nb: categoryNode.name_nb, slug: categoryNode.slug ?? null }
        : null,
      images: images.map((img, i) => ({
        storage_path: String(i),
        sort_order: i,
        caption: img.caption?.trim() || null,
      })),
      imgUrls: Object.fromEntries(images.map((img, i) => [String(i), img.previewUrl])),
      attributes,
    });
    setHasPreviewed(true);
    setPreviewNudgeOpen(false);
    setPreviewOpen(true);
  }

  // Redirect to home if no type selected and no draft — entry should go through the picker dialog
  useEffect(() => {
    if (listingType === null && !hasDraftData) {
      void navigate({ to: "/" });
    }
  }, [listingType, hasDraftData, navigate]);

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

  const applyCategorySelect = (via: "wizard" | "sheet", id: string, parentId: string) => {
    setCategoryTouchedManually(true);
    setSelectedParentId(parentId);
    setValue("category_id", id, { shouldValidate: true });
    setCategorySuggestions([]);
    if (via !== "wizard") return;
    if (currentPage?.groups?.some((g) => g.key === "category-select")) {
      goToNextPage();
    } else if (currentPage?.groups?.some((g) => g.key === "category-confirm")) {
      setCategoryConfirmed(true);
    } else if (
      currentPage?.groups?.some((g) => g.key === "vehicle-registration") &&
      id !== bilOgMcCategoryId
    ) {
      // Uregistrert kjøretøy: lagre det som et eget, søkbart attributt (i
      // stedet for bare transient wizard-state) og rydd bort ev. tidligere
      // SVV-oppslagsdata, symmetrisk med is_registered: true i
      // confirmVehicleData. Ikke goNext() her — brukeren skal fylle inn de
      // samme tekniske feltene manuelt rett under kategorivelgeren på dette
      // steget før de går videre (se VehicleRegistration).
      setAttributes((prev) => {
        const next: AttributeMap = { ...prev, is_registered: false };
        delete next.registration_number;
        delete next.vehicle_lookup;
        return next;
      });
    }
  };

  // Switching to a different category mid-flow discards the category-specific
  // fields the user already filled — confirm before applying.
  // Re-opening the collapsed vehicle-registration category grid to pick a
  // different subcategory discards the same manually-filled fields as an
  // ordinary category switch, so it goes through the same confirm dialog.
  // Resets to the "Bil og MC" group itself (not ""), since an empty
  // category_id falls back to the generic non-vehicle flow/page set
  // (effectiveFlowForCategory(null, ...)) — that reshapes `pages` under the
  // wizard's still-current step index and reads as an unwanted jump forward.
  const requestCategoryDeselect = (parentId: string) => {
    const resetId = bilOgMcCategoryId ?? "";
    if (Object.keys(attributes).length > 0) {
      setPendingCategoryChange({ id: resetId, parentId, via: "wizard", kind: "deselect" });
      return;
    }
    applyCategorySelect("wizard", resetId, parentId);
  };

  const requestCategorySelect = (via: "wizard" | "sheet", id: string, parentId: string) => {
    // Picking a different underkategori while still on vehicle-registration
    // (the new icon grid over Merke/Modell) is deliberately friction-free —
    // no "may lose data" dialog — since nothing is considered committed
    // until the user actually leaves this page. See vehicleSubcategoryLocked
    // below for the (separate) confirm-gated flow once they have left it.
    const onVehicleRegPage = currentPage?.groups?.some((g) => g.key === "vehicle-registration");
    if (
      !onVehicleRegPage &&
      categoryId &&
      id !== categoryId &&
      Object.keys(attributes).length > 0
    ) {
      setPendingCategoryChange({ id, parentId, via, kind: "select" });
      return;
    }
    applyCategorySelect(via, id, parentId);
  };

  const applySuggestedCategory = (id: string) => {
    applyCategorySuggestion(id);
    if (currentPage?.groups?.some((group) => group.key === "category-select")) {
      goToNextPage();
    } else if (currentPage?.groups?.some((group) => group.key === "category-confirm")) {
      setCategoryConfirmed(true);
    }
  };

  const confirmPendingCategoryChange = () => {
    if (!pendingCategoryChange) return;
    setAttributes({});
    setAttributesTouched(false);
    applyCategorySelect(
      pendingCategoryChange.via,
      pendingCategoryChange.id,
      pendingCategoryChange.parentId,
    );
    setPendingCategoryChange(null);
  };

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
    setCategoryPickerOpen,
    onCategorySelect: (id, parentId) => requestCategorySelect("wizard", id, parentId),
    onCategoryDeselect: requestCategoryDeselect,
    categorySuggestions,
    categorySuggestionLoading,
    categoryTouchedManually,
    applyCategorySuggestion: applySuggestedCategory,
    setSuggestionDismissed,
    setCategorySuggestions,
    attributes,
    onAttributesChange: setAttributes,
    attributesTouched,
    genericAttributesActive,
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
    draftId,
    ensureDraftId,

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
    turnstileToken,
    setTurnstileToken,
    onCancel: () => navigate({ to: "/" }),
    onPreview: openPreview,
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

  const groups = currentPage?.groups ?? [];
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
    (v) => {
      if (missingFilters.length > 0) {
        trackProductEvent("listing_creation_step_completed", {
          kind: "sell",
          action: "validation_failed",
          step: currentStepKey,
          reason: "required_attributes",
        });
        setAttributesTouched(true);
        pendingReviewFocusRef.current = missingFilters[0]?.key
          ? `attr-${missingFilters[0].key}`
          : null;
        if (categoryAttributesPageIndex >= 0) setStep(categoryAttributesPageIndex + 1);
        setValidationError("Fyll inn alle obligatoriske egenskaper før du publiserer.");
        return;
      }
      if (!hasPreviewed && !native) {
        pendingSubmitValuesRef.current = v;
        setPreviewNudgeOpen(true);
        return;
      }
      trackProductEvent("listing_creation_step_completed", {
        kind: "sell",
        action: "publish_started",
        step: currentStepKey,
      });
      mutation.mutate(v);
    },
    // eslint-disable-next-line react-hooks/refs -- callback runs only on form submit
    (fields) => {
      handleInvalidSubmit(fields);
      trackProductEvent("listing_creation_step_completed", {
        kind: "sell",
        action: "validation_failed",
        step: currentStepKey,
        reason: "publish_form",
      });
    },
  );
  const composerFooter = (
    <>
      {!native && !isFirst && !isCategoryConfirmPage && (
        <Button type="button" variant="ghost" onClick={goBack}>
          <ChevronLeft className="size-4" aria-hidden /> Tilbake
        </Button>
      )}
      {isCategoryConfirmPage ? null : !isLast ? (
        <Button
          type="button"
          data-testid="wizard-next-button"
          disabled={vehicleLookupLoading}
          onClick={() => void attemptNextPage()}
          className={native ? "min-h-12 min-w-24 rounded-xl px-3 text-base" : undefined}
        >
          {vehicleLookupLoading ? (
            "Slår opp kjøretøy…"
          ) : (
            <>
              {native ? "Fortsett" : `Neste: ${pageLabel(nextGroups)}`}{" "}
              <ChevronRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      ) : (
        <PublishActions
          native={native}
          turnstileEnabled={turnstileEnabled}
          turnstileToken={turnstileToken}
          setTurnstileToken={setTurnstileToken}
          mutationIsPending={mutation.isPending}
          onCancel={() => navigate({ to: "/" })}
        />
      )}
    </>
  );

  return (
    <>
      <form onSubmit={submitComposer}>
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
            hasDraftData ? (
              <div className="mt-4 flex flex-col items-stretch gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p>
                    Lagret utkast: <strong>{restorableDraftTitle}</strong>
                  </p>
                  {(restorableDraftCategory || restorableDraftSavedAtLabel) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {restorableDraftCategory ? `Kategori: ${restorableDraftCategory}` : null}
                      {restorableDraftCategory && restorableDraftSavedAtLabel ? " · " : null}
                      {restorableDraftSavedAtLabel ? `Lagret ${restorableDraftSavedAtLabel}` : null}
                    </p>
                  )}
                </div>
                <div className="flex w-full shrink-0 flex-col justify-end gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                  <Button
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
                    Start ny annonse
                  </Button>
                </div>
              </div>
            ) : undefined
          }
          progress={
            categoryId ? (
              <StepIndicator step={step} pages={pages} />
            ) : (
              <nav aria-label="Annonseopprettelse">
                <span className="text-sm font-medium">Kategori</span>
              </nav>
            )
          }
          status={
            draftSaveError ? (
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
          errorSummary={validationError}
          validationAttempt={validationAttempt}
          footer={composerFooter}
          firstStep={isFirst}
          aside={
            !native ? (
              <>
                <section aria-labelledby="desktop-publishing-status-title" className="space-y-2">
                  <h2 id="desktop-publishing-status-title" className="text-lg font-semibold">
                    Publiseringsstatus
                  </h2>
                  {missingPublishingCount > 0 ? (
                    <button
                      type="button"
                      data-testid="publishing-status-button"
                      aria-haspopup="dialog"
                      onClick={() => setPublishingStatusOpen(true)}
                      className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left transition-[background-color,border-color] duration-150 hover:border-primary/70 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          role="status"
                          aria-live="polite"
                          className="block text-sm font-medium text-foreground"
                        >
                          {publishingStatus}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Trykk for å se hva som mangler
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                      {publishingStatus}
                    </p>
                  )}
                </section>
                <ReviewPreview
                  headingId="desktop-listing-preview-title"
                  images={images}
                  title={title}
                  subtitle={subtitle}
                  priceNok={priceNok}
                  isFree={isFree}
                  city={city}
                  postalCode={postalCode}
                  categorySlug={categorySlug}
                  attributes={attributes}
                  onPreview={openPreview}
                />
              </>
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

      <ResponsiveOverlay open={publishingStatusOpen} onOpenChange={setPublishingStatusOpen}>
        <ResponsiveOverlayContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-md"
          expandable
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Opplysninger som mangler</DialogTitle>
            <DialogDescription>
              Fyll ut disse opplysningene før annonsen kan publiseres.
            </DialogDescription>
          </DialogHeader>
          <ComposerReviewStatuses items={sortedPublishingRequirements} />
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>

      <AlertDialog open={previewNudgeOpen} onOpenChange={setPreviewNudgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annonsen er ikke forhåndsvist ennå</AlertDialogTitle>
            <AlertDialogDescription>
              Gå tilbake til gjennomgangen for å se forhåndsvisningen, eller publiser direkte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              data-testid="publish-anyway-button"
              onClick={() => {
                setPreviewNudgeOpen(false);
                if (pendingSubmitValuesRef.current) {
                  trackProductEvent("listing_creation_step_completed", {
                    kind: "sell",
                    action: "publish_started",
                    step: currentStepKey,
                  });
                  mutation.mutate(pendingSubmitValuesRef.current);
                }
              }}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Publiser likevel
            </AlertDialogAction>
            <AlertDialogCancel>Tilbake</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category picker bottom sheet */}
      <CategoryPicker
        open={categoryPickerOpen}
        onOpenChange={(open) => {
          setCategoryPickerOpen(open);
          if (!open && editingCategoryViaTitle) {
            setEditingCategoryViaTitle(false);
            returnToReviewRef.current = false;
          }
        }}
        categories={pickableCategories}
        selectedId={categoryId}
        onSelect={(id, parentId) => {
          if (editingCategoryViaTitle) {
            // Already confirmed via categoryEditConfirmOpen below — apply
            // directly instead of routing through requestCategorySelect's own
            // (attribute-count-gated) confirm dialog, which would otherwise
            // double-prompt the user for the same change. Still discards
            // category-specific attributes on the way, same as
            // confirmPendingCategoryChange does for the ordinary mid-flow
            // category switch — they belonged to the old category and may
            // not even apply as fields under the new one.
            setEditingCategoryViaTitle(false);
            setAttributes({});
            setAttributesTouched(false);
            applyCategorySelect("sheet", id, parentId);
            if (returnToReviewRef.current) {
              setReviewJumpRequested(true);
              returnToReviewRef.current = false;
            }
            return;
          }
          requestCategorySelect("sheet", id, parentId);
        }}
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
            <AlertDialogCancel
              onClick={() => {
                returnToReviewRef.current = false;
                reviewSectionLastStepRef.current = null;
              }}
            >
              Avbryt
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCategoryEditConfirmOpen(false);
                if (vehicleSubcategoryLocked && vehicleRegPageIndex >= 0) {
                  setStep(vehicleRegPageIndex + 1);
                  window.scrollTo({ top: 0 });
                  return;
                }
                setEditingCategoryViaTitle(true);
                setCategoryPickerOpen(true);
              }}
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

      <NoImageDialog
        open={showNoImageDialog}
        onOpenChange={setShowNoImageDialog}
        onContinue={() => {
          setShowNoImageDialog(false);
          void goToNextPage({ skipImageCheck: true });
        }}
      />

      <AlertDialog open={draftDiscardConfirmOpen} onOpenChange={setDraftDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Starte ny annonse?</AlertDialogTitle>
            <AlertDialogDescription>
              Det lagrede utkastet slettes fra denne enheten og serveren. Informasjonen du allerede
              har skrevet i denne annonsen beholdes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fortsett utkastet</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void startNewListing()}
            >
              Start ny annonse
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

      {previewOpen && previewDraft && (
        <PreviewDraftView draft={previewDraft} onClose={() => setPreviewOpen(false)} />
      )}

      {previewOpen ? (
        <AlertDialog
          open={blocker.status === "blocked"}
          onOpenChange={(open) => {
            if (!open) blocker.reset?.();
          }}
        >
          <AlertDialogContent onClickOutside={() => blocker.reset?.()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Annonsen er ikke publisert ennå</AlertDialogTitle>
              <AlertDialogDescription>Er du sikker på at du vil avslutte?</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
              <AlertDialogAction
                className="h-14 w-full bg-secondary text-destructive hover:bg-secondary/80"
                onClick={() => {
                  setPreviewOpen(false);
                  blocker.proceed?.();
                }}
              >
                Avslutt uten å publisere
              </AlertDialogAction>
              <AlertDialogCancel
                className="h-14 w-full border-0 bg-secondary text-secondary-foreground hover:bg-secondary/80 !mt-0"
                onClick={() => blocker.reset?.()}
              >
                Fortsett forhåndsvisning
              </AlertDialogCancel>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <DiscardListingDialog
          open={blocker.status === "blocked"}
          onReset={() => blocker.reset?.()}
          onDiscard={async () => {
            await discardDraft();
            blocker.proceed?.();
          }}
          onSaveDraft={async () => {
            setIsSavingDraft(true);
            const id = await saveDraftToSupabase();
            setIsSavingDraft(false);
            if (!id) return false;
            blocker.proceed?.();
            return true;
          }}
          isSavingDraft={isSavingDraft}
        />
      )}

      {publishedId && (
        <PublishedListingDialog
          listingId={publishedId}
          open={publishedOpen}
          onOpenChange={setPublishedOpen}
          canPromote={isDemo}
          onView={() => {
            setPublishedOpen(false);
            if (publishedCode)
              navigate({ to: "/$kaupetCode", params: { kaupetCode: publishedCode } });
          }}
          onPromote={() => {
            setPublishedOpen(false);
            setPromoteOpen(true);
          }}
          onClose={() => {
            if (!promoteOpen) navigate({ to: "/mine-annonser" });
          }}
        />
      )}

      {publishedId && (
        <PromoteListingDialog
          listingId={publishedId}
          open={promoteOpen}
          onOpenChange={(o) => {
            setPromoteOpen(o);
            if (!o) navigate({ to: "/mine-annonser" });
          }}
        />
      )}
    </>
  );
}
