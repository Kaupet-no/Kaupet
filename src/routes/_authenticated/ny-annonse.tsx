import { useEffect, useMemo, useRef, useState } from "react";
import { NativePageHeader } from "@/components/native-page-header";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createListing } from "@/lib/listings.functions";
import { uploadListingImage } from "@/lib/storage";
import { geocodeNorwayAddress } from "@/lib/geocode";
import { type PendingImage } from "@/components/image-uploader";
import { FullscreenLocationPicker } from "@/components/fullscreen-location-picker";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { PublishedListingDialog } from "@/components/published-listing-dialog";
import { CategoryPicker } from "@/components/category-picker";
import { useAllCategoryFilters, type AttributeMap } from "@/components/attribute-fields";
import { modulesForKeys } from "@/features/listing-creation/modules/registry";
import {
  effectiveFlowForCategory,
  resolveWizardPages,
} from "@/features/listing-creation/category-flows";
import { useAllCategoryFlows } from "@/features/listing-creation/use-all-category-flows";
import { useListingSteps, type WizardPage } from "@/features/listing-creation/use-listing-steps";
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
} from "@/lib/vehicle/vehicle-lookup.server";
import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

import { useIsDemo } from "@/hooks/use-is-demo";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
import { formatErrorMessage } from "@/lib/errors";
import { CONDITIONS, VEHICLE_CONDITIONS } from "@/lib/constants";
import { isNative } from "@/lib/native";

import { PublishActions } from "@/features/listing-creation/field-groups/review-publish";
import type { WizardSharedProps } from "@/features/listing-creation/field-groups/types";
import type { PreviewDraft } from "@/features/listing-creation/preview-draft-store";
import { PreviewDraftView } from "@/features/listing-creation/preview-draft-view";
import { NewListingError } from "@/features/listing-creation/new-listing-error";
import { StepIndicator } from "@/features/listing-creation/step-indicator";

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
 * other: vehicle-facts (Tittel/Kilometerstand/Pris/Undertittel),
 * vehicle-condition (Tilstand/kjente feil-mangler/vedlikeholdshistorikk) and
 * description-keywords (ren beskrivelse+nøkkelord) — split up per the UX
 * audit so the flow isn't one overloaded "Beskrivelse" step. Deliberately
 * excludes "vehicle-equipment" (Utstyr): that one is meant to sit on the
 * *same* page as description-keywords, directly under the Beskrivelse
 * field — so as long as it's the very next key after description-keywords
 * in field_groups (see the bil-og-mc migration), it joins that page's
 * buffer instead of starting a new one. See resolveWizardPages'
 * `forceBreakBeforeKeys`. */
const VEHICLE_FORCE_BREAK_BEFORE_KEYS = new Set([
  "vehicle-facts",
  "vehicle-condition",
  "description-keywords",
]);

export const Route = createFileRoute("/_authenticated/ny-annonse")({
  validateSearch: z
    .object({
      type: z.enum(["sell"]).optional(),
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
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const pendingSubmitValuesRef = useRef<ListingForm | null>(null);
  const [showNoImageDialog, setShowNoImageDialog] = useState(false);
  const [showNoPriceDialog, setShowNoPriceDialog] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<PreviewDraft | null>(null);
  const [previewNudgeOpen, setPreviewNudgeOpen] = useState(false);
  const [attributes, setAttributes] = useState<AttributeMap>({});
  const [attributesTouched, setAttributesTouched] = useState(false);
  const native = isNative();
  const { data: isDemo = false } = useIsDemo();
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const { type: typeParam } = Route.useSearch();
  const listingType = typeParam ?? null;

  const { data: categories } = useQuery({
    queryKey: ["categories", "with-parent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, slug, parent_id, icon, color")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const bilOgMcCategoryId = useMemo(
    () => (categories ?? []).find((c) => c.slug === "bil-og-mc" && !c.parent_id)?.id ?? null,
    [categories],
  );

  const [selectedParentId, setSelectedParentId] = useState<string>("");

  const { data: allFilters } = useAllCategoryFilters();
  const { data: allFlows } = useAllCategoryFlows();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string; slug?: string }>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, touchedFields },
  } = useForm<ListingForm>({
    resolver: zodResolver(listingSchema),
    mode: "onTouched",
    defaultValues: {
      title: "",
      subtitle: "",
      description: "",
      category_id: "",
      condition: "good",
      is_free: false,
      can_ship: "pickup" as const,
      price_nok: "",
      postal_code: "",
      city: "",
      known_issues: "",
      no_known_issues: false,
      maintenance_history: "",
    },
  });

  const isFree = watch("is_free");
  const canShip = watch("can_ship");
  const categoryId = watch("category_id");
  const condition = watch("condition");
  const postalCode = watch("postal_code");
  const city = watch("city");
  const title = watch("title");
  const subtitle = watch("subtitle");
  const description = watch("description");
  const priceNok = watch("price_nok");
  const knownIssues = watch("known_issues");
  const noKnownIssues = watch("no_known_issues");
  const maintenanceHistory = watch("maintenance_history");

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
  const behavior = useMemo(() => getCategoryBehavior(vehicleGroup), [vehicleGroup]);

  const showMileage = useMemo(() => {
    if (!isVehicle) return false;
    const slug = categoriesById.get(categoryId)?.slug;
    return !VEHICLE_LEAF_SLUGS_WITHOUT_MILEAGE.includes(slug as VehicleLeafSlug);
  }, [isVehicle, categoryId, categoriesById]);

  const activeModules = useMemo(
    () =>
      modulesForKeys(
        effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById).modules,
      ),
    [categoryId, allFlows, categoriesById],
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
    vehicleLookupConfirmOpen,
    setVehicleLookupConfirmOpen,
    vehicleConfirmFooterSlot,
    setVehicleConfirmFooterSlot,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    runVehicleLookup,
    matchVehicleBrandForLeaf,
    confirmVehicleData,
    adjustVehicleRegistrationNumber,
    resetLookupOnReturnToRegistration,
  } = useVehicleLookupFlow({
    allFilters,
    categoriesById,
    attributes,
    setAttributes,
    setCategoryTouchedManually,
    setSelectedParentId,
    setValue,
    goNext: () => goNextRef.current(),
  });

  const vehicleAttributeHiddenKeys = [
    ...(vehicleLookupResult ? VEHICLE_LOOKUP_FILTER_KEYS : []),
    ...VEHICLE_WIZARD_MANAGED_KEYS,
  ];

  const baseFieldGroupKeys = useMemo(
    () => effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById).fieldGroups,
    [categoryId, allFlows, categoriesById],
  );

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
  // description-keywords pages regardless of registered-or-not, the page
  // count itself never actually needs to change — only `isVehicle` (which
  // still gates vehicle-specific rendering choices like condition options or
  // showMileage, evaluated later once a leaf is genuinely known) does.
  const isVehicleFlow = baseFieldGroupKeys.includes("vehicle-registration");

  // Inject vehicle-confirm right after vehicle-registration once a lookup has
  // succeeded — it's never part of a category's stored field_groups (see
  // category-flows.ts), so it only ever appears in the live wizard state.
  const fieldGroupKeys = useMemo(() => {
    if (!vehicleLookupResult) return baseFieldGroupKeys;
    const idx = baseFieldGroupKeys.indexOf("vehicle-registration");
    if (idx === -1) return baseFieldGroupKeys;
    return [
      ...baseFieldGroupKeys.slice(0, idx + 1),
      "vehicle-confirm",
      ...baseFieldGroupKeys.slice(idx + 1),
    ];
  }, [baseFieldGroupKeys, vehicleLookupResult]);

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

  const { step, setStep, currentPage, goNext, goBack, isFirst, isLast } = useListingSteps(pages);
  goNextRef.current = goNext;

  /** The in-page "Tilbake" button calls `goBack()` directly (see the footer
   * button below) — it steps the wizard's own `pages` array backward and is
   * unaffected by how many pages currently exist, so it stays correct even
   * when `pages` changes shape at runtime (e.g. the vehicle-confirm page
   * being inserted/removed for Bil og MC, see the effect below).
   *
   * The physical browser back button (and mobile swipe-back) should behave
   * the same way instead of leaving the route entirely. We push a single
   * guard entry on mount and, on every popstate while the wizard isn't on
   * its first step, call the same `goBack()` and immediately re-push the
   * guard so the browser history stack can never run out mid-wizard. There
   * is no stored step number to go stale — `goBack` always acts on the live
   * `pages` array, so this can't desync the way a stored step index could. */
  useEffect(() => {
    window.history.pushState({ wizardGuard: true }, "");
  }, []);

  const isFirstRef = useRef(isFirst);
  isFirstRef.current = isFirst;
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useEffect(() => {
    function onPopState() {
      if (!isFirstRef.current) {
        goBackRef.current();
        window.history.pushState({ wizardGuard: true }, "");
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /** Stepping back from vehicle-confirm to vehicle-registration (via
   * "Tilbake") is the only way to reach vehicle-registration a second time —
   * clear the stale lookup so the reg-nr field is editable again and
   * pressing "Neste" re-runs the lookup instead of bouncing straight back to
   * vehicle-confirm with old data. Replaces the old dedicated "Feil treff /
   * kjøretøyet er ikke registrert" link, since Tilbake now covers that. */
  const prevPageKeyRef = useRef<string | undefined>(currentPage?.groups?.[0]?.key);
  useEffect(() => {
    const key = currentPage?.groups?.[0]?.key;
    if (key === "vehicle-registration" && prevPageKeyRef.current === "vehicle-confirm") {
      resetLookupOnReturnToRegistration();
    }
    prevPageKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const categoryAttributesPageIndex = pages.findIndex((p) =>
    p.groups.some((g) => g.key === "category-attributes"),
  );

  const shouldBlockNav =
    publishedId === null &&
    (title.trim().length > 0 || images.length > 0 || vehicleLookupResult !== null);
  const blocker = useBlocker({
    shouldBlockFn: () => shouldBlockNav,
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
    discardLocalDraftBanner,
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
  });

  function restoreDraft() {
    restoreDraftFields({ setValue, setSelectedParentId, setLocationMethod });
  }

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
    categorySuggestion,
    setCategorySuggestion,
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
    setValue,
  });

  /** "Stemmer, fortsett" i bekreftelsesoverlayet: lukker overlayet og tar
   * brukeren rett videre til vehicle-confirm-steget (type-valg + detaljtabell),
   * fremfor å kreve et ekstra klikk på Neste. */
  async function confirmVehicleLookupAndContinue() {
    setVehicleLookupConfirmOpen(false);
    await goToNextPage();
  }

  async function goToNextPage(options?: { skipImageCheck?: boolean; skipPriceCheck?: boolean }) {
    const groups = currentPage?.groups ?? [];

    // "Slå opp"-knappen er fjernet — oppslaget kjøres nå fra selve
    // Neste-knappen når brukeren står på vehicle-registration-steget med et
    // uslått-opp regnr. Ved treff åpner runVehicleLookup bekreftelsesoverlayet
    // (Regnr/Merke/Modell) og vi blir stående på steget til brukeren
    // bekrefter der; ved feil vises vehicleLookupError og vi blir også
    // stående, slik at brukeren kan rette registreringsnummeret.
    if (
      groups.some((g) => g.key === "vehicle-registration") &&
      vehicleRegistered &&
      !vehicleLookupResult
    ) {
      if (!vehicleRegNrInput.trim()) {
        showErrorToast("Skriv inn registreringsnummer.");
        return;
      }
      await runVehicleLookup(vehicleRegNrInput);
      return;
    }

    // For kjøretøy rendrer title-photos kun bilder (se TitlePhotos) — feltet
    // "title" fylles først på description-keywords-steget (VehicleTitleFields),
    // så det skal ikke valideres her, ellers blokkeres Neste stille uten
    // synlig feilmelding.
    const fields = groups
      .flatMap((g) => g.fieldsToValidate ?? [])
      .filter((f) => !(isVehicle && f === "title"));
    const valid = fields.length > 0 ? await trigger(fields) : true;
    if (!valid) return;
    const validateCtx = {
      images,
      attributes,
      activeModules,
      missingFilters,
      isFree,
      priceNok,
      categoryId,
      bilOgMcCategoryId,
      vehicleLookupResult,
      behavior,
      knownIssues,
      noKnownIssues: !!noKnownIssues,
      showMileage,
    };
    for (const group of groups) {
      const result = group.validateExtra?.(validateCtx);
      if (result === "SHOW_NO_IMAGE_DIALOG") {
        if (options?.skipImageCheck) continue;
        setShowNoImageDialog(true);
        return;
      }
      if (result === "SHOW_NO_PRICE_DIALOG") {
        if (options?.skipPriceCheck) continue;
        setShowNoPriceDialog(true);
        return;
      }
      if (typeof result === "string") {
        if (group.key === "category-attributes") setAttributesTouched(true);
        showErrorToast(result);
        return;
      }
    }
    goNext();
    window.scrollTo({ top: 0, behavior: "smooth" });
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
          city: values.city || null,
          lat: finalCoords?.lat ?? null,
          lng: finalCoords?.lng ?? null,
          can_ship:
            fieldGroupKeys.includes("delivery-location") && !isVehicle
              ? values.can_ship !== "pickup"
              : null,
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
        const results = await Promise.all(
          images.map(async (img, i) => {
            const path = await uploadListingImage({
              userId,
              listingId: listing.id,
              index: i,
              file: img.file,
            });
            done += 1;
            setUploadProgress({ done, total: images.length });
            return { storage_path: path, sort_order: i, caption: img.caption?.trim() || null };
          }),
        );
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
      void import("@/lib/haptics").then((m) => m.hapticNotification("success"));
      showSuccessToast("Annonsen er publisert");
      setPublishedId(result.id);
      setPublishedCode(result.kaupet_code);
      setPublishedOpen(true);
    },
    onError: (err: Error) => {
      setUploadProgress(null);
      void import("@/lib/haptics").then((m) => m.hapticNotification("error"));
      showErrorToast(formatErrorMessage(err, "Kunne ikke publisere annonsen"));
    },
  });

  const conditionDescription = (isVehicle ? VEHICLE_CONDITIONS : CONDITIONS).find(
    (c) => c.value === condition,
  )?.description;

  const parsedPriceNok =
    typeof priceNok === "number" ? priceNok : priceNok !== "" ? Number(priceNok) : NaN;
  const previewPrice = isFree
    ? "Gratis"
    : !isNaN(parsedPriceNok) && parsedPriceNok >= 0
      ? `${parsedPriceNok.toLocaleString("nb-NO")} kr`
      : null;

  const savedTimeLabel = lastSaved
    ? `Utkast lagret kl. ${lastSaved.getHours().toString().padStart(2, "0")}:${lastSaved.getMinutes().toString().padStart(2, "0")}`
    : null;

  // Derived label for the category picker button
  const categoryLabel = categoryId ? categoryBreadcrumb(categoryId, categoriesById) || null : null;

  function openPreview() {
    const categoryNode = categoryId ? categoriesById.get(categoryId) : undefined;
    setPreviewDraft({
      title,
      subtitle: subtitle || null,
      description,
      priceNok: isFree ? null : typeof priceNok === "number" ? priceNok : null,
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

  const sharedProps: WizardSharedProps = {
    native,
    isVehicle,
    behavior,
    showMileage,

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

    categories: categories ?? [],
    categoryLabel,
    setCategoryPickerOpen,
    onCategorySelect: (id, parentId) => {
      setCategoryTouchedManually(true);
      setSelectedParentId(parentId);
      setValue("category_id", id, { shouldValidate: true });
      setCategorySuggestion(null);
      if (currentPage?.groups?.some((g) => g.key === "category-select")) {
        goToNextPage();
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
    },
    categorySuggestion,
    categoryTouchedManually,
    applyCategorySuggestion,
    setSuggestionDismissed,
    setCategorySuggestion,

    attributes,
    onAttributesChange: setAttributes,
    attributesTouched,
    activeModules,
    vehicleAttributeHiddenKeys,

    bilOgMcCategoryId,
    vehicleRegistered,
    setVehicleRegistered,
    vehicleLookupLoading,
    vehicleLookupError,
    vehicleLookupResult,
    vehicleClassification,
    vehiclePreviousClassificationMismatch,
    vehicleConfirmFooterSlot,
    vehicleLookupConfirmOpen,
    setVehicleLookupConfirmOpen,
    adjustVehicleRegistrationNumber,
    confirmVehicleLookupAndContinue,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    runVehicleLookup,
    matchVehicleBrandForLeaf,
    confirmVehicleData,

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
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-4">
      <NativePageHeader title="Ny annonse" backTo="/" />
      {!native && <h1 className="font-display text-3xl tracking-tight">Ny annonse</h1>}

      {/* Draft restore banner */}
      {hasDraftData && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="flex-1">Du har et ulagret utkast. Vil du fortsette der du slapp?</span>
          <Button type="button" size="sm" variant="secondary" onClick={restoreDraft}>
            Gjenopprett
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={discardLocalDraftBanner}>
            Forkast
          </Button>
        </div>
      )}

      {/* Sticky step indicator — hidden until a category is chosen: each
          category can have a different flow length (see category_flows),
          so showing a page-count/progress-fill before that's known would
          either lie (wrong total) or force a flash-of-wrong-content once
          the real per-category total resolves. */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur border-b border-border mt-4">
        {categoryId && <StepIndicator step={step} pages={pages} native={native} />}
        {draftSaveError ? (
          <p className="mt-1 text-right text-xs text-destructive">Utkast ble ikke lagret</p>
        ) : (
          savedTimeLabel && (
            <p className="mt-1 text-right text-xs text-muted-foreground">{savedTimeLabel}</p>
          )
        )}
      </div>

      <form
        onSubmit={handleSubmit((v) => {
          if (missingFilters.length > 0) {
            setAttributesTouched(true);
            if (categoryAttributesPageIndex >= 0) setStep(categoryAttributesPageIndex + 1);
            showErrorToast("Fyll inn alle obligatoriske egenskaper før du publiserer.");
            return;
          }
          if (!hasPreviewed) {
            pendingSubmitValuesRef.current = v;
            setPreviewNudgeOpen(true);
            return;
          }
          mutation.mutate(v);
        })}
        className={`mt-8 ${native ? (isLast ? "overflow-hidden" : "pb-[calc(var(--app-bottom-nav-h)+1.5rem)]") : "pb-24"}`}
      >
        {(() => {
          const groups = currentPage?.groups ?? [];
          const isNativeDescriptionSoloPage =
            native && groups.length === 1 && groups[0].key === "description-keywords";
          // vehicle-confirm has its own "Bekreft og fortsett" button that
          // commits the data and advances the wizard itself — the generic
          // footer "Neste" button would be a redundant second way to do the
          // same thing, so it's suppressed on this page.
          const isVehicleConfirmPage = groups.length === 1 && groups[0].key === "vehicle-confirm";
          const nextGroups = pages[step]?.groups ?? [];
          return (
            <div
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

              <div
                className={`${
                  native
                    ? "fixed inset-x-0 bottom-[var(--app-bottom-nav-h)] z-40 bg-background/95 px-4 pt-3 pb-3 backdrop-blur border-t border-border"
                    : "border-t border-border pt-6"
                } flex items-center ${isFirst ? "justify-end" : "justify-between"}`}
              >
                {!isFirst && (
                  <Button type="button" variant="ghost" onClick={goBack}>
                    <ChevronLeft className="size-4" /> Tilbake
                  </Button>
                )}
                {isVehicleConfirmPage ? (
                  <div ref={setVehicleConfirmFooterSlot} className="contents" />
                ) : !isLast ? (
                  <Button
                    type="button"
                    disabled={vehicleLookupLoading}
                    onClick={() => void goToNextPage()}
                  >
                    {vehicleLookupLoading ? (
                      "Slår opp kjøretøy…"
                    ) : (
                      <>
                        Neste: {pageLabel(nextGroups, native)} <ChevronRight className="size-4" />
                      </>
                    )}
                  </Button>
                ) : (
                  <PublishActions
                    turnstileEnabled={turnstileEnabled}
                    turnstileToken={turnstileToken}
                    setTurnstileToken={setTurnstileToken}
                    mutationIsPending={mutation.isPending}
                    onCancel={() => navigate({ to: "/" })}
                    onPreview={openPreview}
                  />
                )}
              </div>
            </div>
          );
        })()}
      </form>

      <AlertDialog open={previewNudgeOpen} onOpenChange={setPreviewNudgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vil du forhåndsvise annonsen før du publiserer?</AlertDialogTitle>
            <AlertDialogDescription>
              Du har ikke sett hvordan annonsen din vil se ut ennå. Du kan forhåndsvise den nå,
              eller publisere direkte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setPreviewNudgeOpen(false);
                if (pendingSubmitValuesRef.current) mutation.mutate(pendingSubmitValuesRef.current);
              }}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Publiser likevel
            </AlertDialogAction>
            <AlertDialogAction onClick={openPreview}>Forhåndsvis annonse</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category picker bottom sheet */}
      <CategoryPicker
        open={categoryPickerOpen}
        onOpenChange={setCategoryPickerOpen}
        categories={categories ?? []}
        selectedId={categoryId}
        onSelect={(id, parentId) => {
          setCategoryTouchedManually(true);
          setSelectedParentId(parentId);
          setValue("category_id", id, { shouldValidate: true });
          setCategorySuggestion(null);
        }}
      />

      {/* No-image confirmation dialog */}
      <AlertDialog open={showNoImageDialog} onOpenChange={setShowNoImageDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ingen bilder lagt til</AlertDialogTitle>
            <AlertDialogDescription>
              Annonser med bilder selger mye raskere. Vil du legge til bilder først, eller fortsette
              uten?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Legg til bilder</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowNoImageDialog(false);
                void goToNextPage({ skipImageCheck: true });
              }}
            >
              Fortsett uten bilde
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No-price confirmation dialog */}
      <AlertDialog open={showNoPriceDialog} onOpenChange={setShowNoPriceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ingen pris satt</AlertDialogTitle>
            <AlertDialogDescription>
              Du har ikke satt en pris. Vil du legge til pris, eller publisere uten?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Legg til pris</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowNoPriceDialog(false);
                void goToNextPage({ skipPriceCheck: true });
              }}
            >
              Fortsett uten pris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation dialog */}
      {fullscreenMapOpen && coords && (
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
      )}

      {previewOpen && previewDraft && (
        <PreviewDraftView draft={previewDraft} onClose={() => setPreviewOpen(false)} />
      )}

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent onClickOutside={() => blocker.reset?.()}>
          {previewOpen ? (
            <>
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
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Avbryte annonsen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vil du lagre annonsen som kladd og fortsette senere, eller forkaste den?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
                <AlertDialogAction
                  className="h-14 w-full bg-secondary text-destructive hover:bg-secondary/80"
                  onClick={() => {
                    clearDraftStorage();
                    blocker.proceed?.();
                  }}
                >
                  Forkast annonse
                </AlertDialogAction>
                <AlertDialogAction
                  className="h-14 w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  disabled={isSavingDraft}
                  onClick={async () => {
                    setIsSavingDraft(true);
                    await saveDraftToSupabase();
                    setIsSavingDraft(false);
                    blocker.proceed?.();
                  }}
                >
                  {isSavingDraft ? "Lagrer…" : "Lagre som kladd"}
                </AlertDialogAction>
                <AlertDialogCancel
                  className="h-14 w-full border-0 bg-secondary text-secondary-foreground hover:bg-secondary/80 !mt-0"
                  onClick={() => blocker.reset?.()}
                >
                  Fortsett å redigere
                </AlertDialogCancel>
              </div>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
}
