import { useEffect, useMemo, useRef, useState } from "react";
import { NativePageHeader } from "@/components/native-page-header";
import { createFileRoute, useNavigate, useBlocker, useRouter, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createListing, saveDraftListing } from "@/lib/listings.functions";
import { uploadListingImage } from "@/lib/storage";
import { geocodeNorwayAddress, lookupPostalCode, reverseGeocodeAddress } from "@/lib/geocode";
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
import { fieldGroupsForKeys, pageLabel } from "@/features/listing-creation/field-groups/registry";
import {
  categoryBreadcrumb,
  getMissingRequiredFilters,
  vehicleCategoryGroupFor,
  type CategoryNode,
} from "@/lib/category-filters";
import { lookupVehicleByRegNumber } from "@/lib/vehicle-lookup.functions";
import { matchVehicleBrandModel } from "@/lib/vehicle-brand-match.functions";
import { classifyVehicleCategory } from "@/lib/vehicle-classification";
import type { VehicleLookupResult } from "@/lib/vehicle-lookup.server";
import type { VehicleClassification } from "@/lib/vehicle-classification";

import { useIsDemo } from "@/hooks/use-is-demo";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { CONDITIONS } from "@/lib/constants";
import { suggestCategoryForTitle } from "@/lib/category-suggestion.functions";
import { suggestKeywordsForListing } from "@/lib/keyword-suggestion.functions";
import { matchWtbListingsForListing } from "@/lib/wtb-listings.functions";
import { getCurrentPosition, requestLocationPermission, isNative } from "@/lib/native";

import { PublishActions } from "@/features/listing-creation/field-groups/review-publish";
import type { WizardSharedProps } from "@/features/listing-creation/field-groups/types";

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
  price_nok: z.union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")]).optional(),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
    .optional()
    .or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
});
type ListingForm = z.infer<typeof listingSchema>;

const DRAFT_KEY = "kaupet_draft_ny_annonse";
const DRAFT_ID_KEY = "kaupet_draft_id";

const SIMILAR_STOPWORDS = new Set([
  "og",
  "er",
  "en",
  "et",
  "ei",
  "i",
  "på",
  "med",
  "til",
  "av",
  "for",
  "som",
  "fra",
  "har",
  "den",
  "det",
  "de",
  "vi",
  "du",
  "kan",
  "ikke",
  "seg",
  "han",
  "hun",
  "men",
  "om",
  "så",
  "ut",
  "enn",
  "da",
  "når",
  "at",
  "dem",
  "sin",
  "hva",
  "ved",
  "var",
  "ny",
  "nye",
  "god",
  "fin",
  "fine",
  "pen",
  "pent",
  "pene",
  "lite",
  "litt",
  "stor",
  "store",
  "liten",
  "billig",
  "rimelig",
  "rask",
  "raskt",
  "gammel",
  "brukt",
  "selger",
  "selges",
  "kjøper",
  "kjøpes",
  "pris",
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

function NewListingError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <AlertCircle className="mx-auto size-10 text-destructive" />
      <h1 className="mt-4 font-display text-2xl">Noe gikk galt</h1>
      <p className="mt-2 text-muted-foreground">{formatErrorMessage(error, "Ukjent feil")}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Utkastet ditt er lagret — du kan trygt prøve på nytt.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button
          variant="outline"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
        >
          Prøv igjen
        </Button>
        <Button asChild>
          <Link to="/mine-annonser">Mine annonser</Link>
        </Button>
      </div>
    </div>
  );
}

function StepIndicator({
  step,
  pages,
  native,
}: {
  step: number;
  pages: WizardPage[];
  native: boolean;
}) {
  const labels = pages.map((p) => pageLabel(p.groups, native));
  const total = labels.length;
  const gapClass = native ? "gap-1.5" : "gap-2";
  const circleClass = native ? "size-6" : "size-7";
  const checkClass = native ? "size-3" : "size-3.5";
  const labelBreakpoint = native ? "lg:inline" : "sm:inline";
  const lineWidth = native ? "w-4" : "w-6";

  return (
    <nav aria-label="Fremdrift i skjema" className={`flex items-center ${gapClass}`}>
      {labels.map((label, i) => {
        const s = i + 1;
        return (
          <div key={label + s} className={`flex items-center ${gapClass}`}>
            <div
              className={`flex ${circleClass} items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                s < step
                  ? "bg-primary text-primary-foreground"
                  : s === step
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
              }`}
              aria-label={`Steg ${s}: ${label}${s < step ? " (fullført)" : s === step ? " (pågår)" : ""}`}
            >
              {s < step ? <Check className={checkClass} /> : s}
            </div>
            <span
              className={`text-xs ${
                s === step
                  ? "inline font-medium text-foreground"
                  : `hidden ${labelBreakpoint} text-muted-foreground`
              }`}
            >
              {label}
            </span>
            {s < total && (
              <div
                className={`h-px ${lineWidth} shrink-0 ${s < step ? "bg-primary" : "bg-border"}`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

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
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [hasDraftData, setHasDraftData] = useState<Record<string, unknown> | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftSaveInProgress = useRef(false);
  const [showNoImageDialog, setShowNoImageDialog] = useState(false);
  const [showNoPriceDialog, setShowNoPriceDialog] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [attributes, setAttributes] = useState<AttributeMap>({});
  const [attributesTouched, setAttributesTouched] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMethod, setLocationMethod] = useState<"gps" | "postal" | null>(null);
  const [fullscreenMapOpen, setFullscreenMapOpen] = useState(false);
  const native = isNative();
  const { data: isDemo = false } = useIsDemo();
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const { type: typeParam } = Route.useSearch();
  const [listingType, setListingType] = useState<"sell" | null>(() => typeParam ?? null);

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

  // Vehicle-first flow state (vehicle-registration / vehicle-confirm field groups)
  const [vehicleRegistered, setVehicleRegistered] = useState(true);
  const [vehicleLookupLoading, setVehicleLookupLoading] = useState(false);
  const [vehicleLookupError, setVehicleLookupError] = useState<string | null>(null);
  const [vehicleLookupResult, setVehicleLookupResult] = useState<VehicleLookupResult | null>(null);
  const [vehicleClassification, setVehicleClassification] = useState<VehicleClassification | null>(
    null,
  );
  const [vehiclePreviousClassificationMismatch, setVehiclePreviousClassificationMismatch] =
    useState<{ slug: string | null; lookedUpAt: string } | null>(null);
  const lookupVehicleFn = useServerFn(lookupVehicleByRegNumber);
  const matchBrandModelFn = useServerFn(matchVehicleBrandModel);

  const parentCategories = (categories ?? []).filter((c) => !c.parent_id);
  const [selectedParentId, setSelectedParentId] = useState<string>("");

  const { data: allFilters } = useAllCategoryFilters();
  const { data: allFlows } = useAllCategoryFlows();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string }>();
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

  const missingFilters = useMemo(
    () =>
      getMissingRequiredFilters(categoryId || null, allFilters ?? [], categoriesById, attributes),
    [categoryId, allFilters, categoriesById, attributes],
  );

  const activeModules = useMemo(
    () =>
      modulesForKeys(
        effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById).modules,
      ),
    [categoryId, allFlows, categoriesById],
  );

  const baseFieldGroupKeys = useMemo(
    () => effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById).fieldGroups,
    [categoryId, allFlows, categoriesById],
  );

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
      resolveWizardPages(fieldGroupKeys, { native }).map((keys) => ({
        groups: fieldGroupsForKeys(keys),
      })),
    [fieldGroupKeys, native],
  );

  const { step, setStep, currentPage, goNext, isFirst, isLast } = useListingSteps(pages);

  /** Browser back should step the wizard backward instead of leaving the
   * route entirely: push a history entry each time the step advances, and
   * on popstate (back button or the in-page "Tilbake" button, which now
   * delegates to `history.back()`) restore the step encoded in that entry
   * — falling back to step 1 for the entry from before the first push.
   * Mirrors the pushState/popstate pattern used by image-lightbox.tsx and
   * map-overlay.tsx for overlay dismissal. */
  const prevStepRef = useRef(step);
  useEffect(() => {
    if (step > prevStepRef.current) {
      window.history.pushState({ wizardStep: step }, "");
    }
    prevStepRef.current = step;
  }, [step]);

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const wizardStep = (e.state as { wizardStep?: number } | null)?.wizardStep;
      setStep(wizardStep ?? 1);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setStep]);
  const categoryAttributesPageIndex = pages.findIndex((p) =>
    p.groups.some((g) => g.key === "category-attributes"),
  );

  const shouldBlockNav = publishedId === null && (title.trim().length > 0 || images.length > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => shouldBlockNav,
    withResolver: true,
    enableBeforeUnload: shouldBlockNav,
  });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastEditedRef = useRef<"postal_code" | "city" | "map" | null>(null);
  const markerMovedRef = useRef(false);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const savedId = localStorage.getItem(DRAFT_ID_KEY);
      if (savedId) setDraftId(savedId);
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const data = JSON.parse(saved) as Record<string, unknown>;
      const savedAt = typeof data.saved_at === "number" ? data.saved_at : 0;
      if (Date.now() - savedAt < 7 * 24 * 60 * 60 * 1000) {
        if (data.title || data.description) setHasDraftData(data);
      } else {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_ID_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

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

  // Autosave to localStorage on field changes
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            title,
            subtitle,
            description,
            selectedParentId,
            category_id: categoryId,
            condition,
            is_free: isFree,
            can_ship: canShip,
            price_nok: priceNok,
            postal_code: postalCode,
            city,
            saved_at: Date.now(),
          }),
        );
        setLastSaved(new Date());
      } catch {
        // ignore storage errors
      }
    }, 2000);
    return () => window.clearTimeout(t);
  }, [
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
  ]);

  async function saveDraftToSupabase() {
    if (draftSaveInProgress.current) return;
    const currentTitle = (title ?? "").trim();
    if (currentTitle.length < 5) return;
    draftSaveInProgress.current = true;
    try {
      const result = await saveDraftListing({
        data: {
          ...(draftId ? { id: draftId } : {}),
          title: currentTitle,
          subtitle: (subtitle ?? "").trim() || null,
          description: (description ?? "").trim() || undefined,
          category_id: categoryId || null,
          condition: condition || undefined,
          is_free: isFree,
          price_nok: isFree ? null : typeof priceNok === "number" ? priceNok : null,
          postal_code: postalCode || null,
          city: city || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          can_ship: canShip !== "pickup",
        },
      });
      setDraftId(result.id);
      setLastSaved(new Date());
      setDraftSaveError(false);
      try {
        localStorage.setItem(DRAFT_ID_KEY, result.id);
      } catch {
        // ignore
      }
    } catch {
      setDraftSaveError(true);
    } finally {
      draftSaveInProgress.current = false;
    }
  }

  // Auto-save draft to Supabase every 30 seconds when form has enough data
  useEffect(() => {
    const interval = window.setInterval(() => {
      void saveDraftToSupabase();
    }, 30_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    description,
    categoryId,
    condition,
    isFree,
    priceNok,
    postalCode,
    city,
    canShip,
    coords,
    draftId,
  ]);

  // Save draft when tab becomes hidden (user switches away or closes tab)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) void saveDraftToSupabase();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    description,
    categoryId,
    condition,
    isFree,
    priceNok,
    postalCode,
    city,
    canShip,
    coords,
    draftId,
  ]);

  function restoreDraft() {
    if (!hasDraftData) return;
    if (typeof hasDraftData.title === "string") setValue("title", hasDraftData.title);
    if (typeof hasDraftData.subtitle === "string") setValue("subtitle", hasDraftData.subtitle);
    if (typeof hasDraftData.description === "string")
      setValue("description", hasDraftData.description);
    if (typeof hasDraftData.condition === "string")
      setValue("condition", hasDraftData.condition as ListingForm["condition"]);
    if (typeof hasDraftData.is_free === "boolean") setValue("is_free", hasDraftData.is_free);
    if (
      hasDraftData.can_ship === "pickup" ||
      hasDraftData.can_ship === "ship" ||
      hasDraftData.can_ship === "both"
    )
      setValue("can_ship", hasDraftData.can_ship);
    if (hasDraftData.price_nok !== undefined)
      setValue("price_nok", hasDraftData.price_nok as ListingForm["price_nok"]);
    if (typeof hasDraftData.postal_code === "string") {
      setValue("postal_code", hasDraftData.postal_code);
      if (hasDraftData.postal_code) setLocationMethod("postal");
    }
    if (typeof hasDraftData.city === "string") setValue("city", hasDraftData.city);
    if (typeof hasDraftData.selectedParentId === "string")
      setSelectedParentId(hasDraftData.selectedParentId);
    if (typeof hasDraftData.category_id === "string")
      setValue("category_id", hasDraftData.category_id);
    setHasDraftData(null);
    showSuccessToast("Utkast gjenopprettet!");
  }

  // Auto-fill city from postal code
  useEffect(() => {
    if (lastEditedRef.current !== "postal_code") return;
    const p = (postalCode ?? "").trim();
    if (!/^\d{4}$/.test(p)) return;
    const t = window.setTimeout(async () => {
      const r = await lookupPostalCode(p);
      if (!r) return;
      if (r.city) setValue("city", r.city, { shouldValidate: false });
      if (!markerMovedRef.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
  }, [postalCode, setValue]);

  // Reverse-geocode map position
  useEffect(() => {
    if (lastEditedRef.current !== "map" || !coords) return;
    const t = window.setTimeout(async () => {
      const r = await reverseGeocodeAddress(coords);
      if (r.city) setValue("city", r.city, { shouldValidate: false });
      if (r.postal_code && /^\d{4}$/.test(r.postal_code)) {
        setValue("postal_code", r.postal_code, { shouldValidate: false });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [coords, setValue]);

  // Category suggestion from title
  const [categoryTouchedManually, setCategoryTouchedManually] = useState(false);
  const [categorySuggestion, setCategorySuggestion] = useState<{
    category_id: string;
    parent_id: string | null;
    name_nb: string;
    parent_name_nb: string | null;
  } | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  useEffect(() => {
    if (categoryTouchedManually || suggestionDismissed) return;
    const t = (title ?? "").trim();
    if (t.length < 5) {
      setCategorySuggestion(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await suggestCategoryForTitle({ data: { title: t } });
        setCategorySuggestion(result.suggestion);
      } catch {
        setCategorySuggestion(null);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [title, categoryTouchedManually, suggestionDismissed]);

  function applyCategorySuggestion() {
    if (!categorySuggestion) return;
    setSelectedParentId(categorySuggestion.parent_id ?? categorySuggestion.category_id);
    setValue("category_id", categorySuggestion.category_id, { shouldValidate: true });
    setCategoryTouchedManually(true);
    setCategorySuggestion(null);
  }

  // Debounced title for similar listings query
  const [debouncedTitle, setDebouncedTitle] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTitle(title ?? ""), 800);
    return () => window.clearTimeout(t);
  }, [title]);

  const { data: similarListings } = useQuery({
    queryKey: ["similar-listings", categoryId, debouncedTitle],
    enabled: debouncedTitle.length >= 5 && !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const significantWords = debouncedTitle
        .toLowerCase()
        .replace(/[^a-zæøå0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !SIMILAR_STOPWORDS.has(w));
      if (significantWords.length === 0) return [];
      const { data } = await supabase
        .from("listings")
        .select("id, title, price_nok, is_free, city")
        .eq("category_id", categoryId)
        .eq("status", "active")
        .textSearch("search_vector", significantWords.join(" "), {
          config: "norwegian",
          type: "plain",
        })
        .limit(3);
      return data ?? [];
    },
  });

  // WTB price hint
  const matchWtbFn = useServerFn(matchWtbListingsForListing);
  const { data: wtbMatch } = useQuery({
    queryKey: ["wtb-match", categoryId ?? null, debouncedTitle],
    enabled: debouncedTitle.length >= 3,
    staleTime: 120_000,
    queryFn: () => matchWtbFn({ data: { title: debouncedTitle, category_id: categoryId || null } }),
  });

  // Keyword suggestions from other listings in the same category
  const { data: keywordSuggestions, isFetching: keywordsFetching } = useQuery({
    queryKey: ["keyword-suggestions", categoryId, debouncedTitle],
    enabled: !!categoryId && debouncedTitle.length >= 3,
    staleTime: 120_000,
    queryFn: () =>
      suggestKeywordsForListing({ data: { title: debouncedTitle, category_id: categoryId! } }),
  });

  function appendTagToDescription(tag: string) {
    const current = (description ?? "").trimEnd();
    const next = current ? `${current} ${tag}` : tag;
    setValue("description", next, { shouldTouch: false });
  }

  async function runVehicleLookup(registrationNumber: string) {
    setVehicleLookupLoading(true);
    setVehicleLookupError(null);
    try {
      const { lookup, previousClassificationMismatch } = await lookupVehicleFn({
        data: { registrationNumber },
      });
      setVehicleLookupResult(lookup);
      setVehicleClassification(
        classifyVehicleCategory(
          lookup.classification_code,
          lookup.body_type_hint,
          lookup.sleeping_places,
        ),
      );
      setVehiclePreviousClassificationMismatch(previousClassificationMismatch);
    } catch (e) {
      setVehicleLookupError(e instanceof Error ? e.message : "Kjøretøyoppslag feilet.");
    } finally {
      setVehicleLookupLoading(false);
    }
  }

  /** Runs the deferred brand/model match for a chosen leaf category, so
   * vehicle-confirm can show/resolve an unmatched brand or model to the user
   * *before* they commit — rather than confirmVehicleData silently leaving
   * brand/model unset. */
  async function matchVehicleBrandForLeaf(leafCategoryId: string) {
    const lookup = vehicleLookupResult;
    if (!lookup) return null;
    const categoryGroup = vehicleCategoryGroupFor(leafCategoryId, allFilters ?? [], categoriesById);
    if (!categoryGroup) return null;
    const { brandMatch, modelMatch } = await matchBrandModelFn({
      data: { brand: lookup.brand, model: lookup.model, categoryGroup },
    });
    return { categoryGroup, brandMatch, modelMatch };
  }

  function confirmVehicleData(
    leafCategoryId: string,
    resolved?: { brandName?: string; modelName?: string },
  ) {
    const lookup = vehicleLookupResult;
    if (!lookup) return;

    const next: AttributeMap = {
      ...attributes,
      is_registered: true,
      registration_number: lookup.registrationNumber,
      vehicle_lookup: JSON.stringify(lookup),
    };
    if (lookup.year) next.year = lookup.year;
    if (lookup.fuel_type) next.fuel_type = lookup.fuel_type;
    if (lookup.weight_kg != null) next.weight_kg = lookup.weight_kg;
    if (lookup.transmission) next.transmission = lookup.transmission;
    if (lookup.color) next.color = lookup.color;
    if (lookup.next_eu_control) next.next_eu_control = lookup.next_eu_control;
    if (lookup.power_hk != null) next.power_hk = lookup.power_hk;
    if (lookup.drive_type) next.drive_type = lookup.drive_type;
    if (lookup.tow_hitch != null) next.tow_hitch = lookup.tow_hitch;
    if (lookup.max_tow_weight_kg != null) next.max_tow_weight_kg = lookup.max_tow_weight_kg;
    if (lookup.seats != null) next.seats = lookup.seats;
    if (lookup.imported_used != null) next.imported_used = lookup.imported_used;
    if (lookup.first_registration_date)
      next.first_registration_date = lookup.first_registration_date;
    if (lookup.cylinders != null) next.cylinders = lookup.cylinders;
    if (lookup.engine_displacement_cc != null)
      next.engine_displacement_cc = lookup.engine_displacement_cc;
    if (lookup.engine_code) next.engine_code = lookup.engine_code;
    if (lookup.sleeping_places != null) next.sleeping_places = lookup.sleeping_places;
    if (resolved?.brandName) next.brand = resolved.brandName;
    if (resolved?.modelName) next.model = resolved.modelName;

    setAttributes(next);
    setCategoryTouchedManually(true);
    setSelectedParentId(categoriesById.get(leafCategoryId)?.parent_id ?? leafCategoryId);
    setValue("category_id", leafCategoryId, { shouldValidate: true });
    goToNextPage();
  }

  function rejectVehicleLookup() {
    setVehicleLookupResult(null);
    setVehicleClassification(null);
    setVehicleLookupError(null);
    setVehiclePreviousClassificationMismatch(null);
    setVehicleRegistered(false);
    setStep(Math.max(1, step - 1));
  }

  async function goToNextPage(options?: { skipImageCheck?: boolean; skipPriceCheck?: boolean }) {
    const groups = currentPage?.groups ?? [];
    const fields = groups.flatMap((g) => g.fieldsToValidate ?? []);
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

  function resetLocationMethod() {
    setLocationMethod(null);
    setCoords(null);
    setValue("postal_code", "");
    setValue("city", "");
    markerMovedRef.current = false;
    lastEditedRef.current = null;
  }

  function switchToPostal() {
    setCoords(null);
    setValue("postal_code", "");
    setValue("city", "");
    markerMovedRef.current = false;
    lastEditedRef.current = null;
    setLocationMethod("postal");
  }

  function switchToGps() {
    setValue("postal_code", "");
    setValue("city", "");
    markerMovedRef.current = false;
    lastEditedRef.current = null;
    void fetchMyLocation();
  }

  async function fetchMyLocation() {
    setLocationMethod("gps");
    setLocationLoading(true);
    try {
      if (isNative()) {
        const permission = await requestLocationPermission();
        if (permission !== "granted") {
          showErrorToast("Gi appen tilgang til posisjon i innstillingene.");
          setLocationMethod(null);
          return;
        }
      }
      const pos = await getCurrentPosition();
      if (!pos) {
        showErrorToast("Kunne ikke hente posisjon.");
        setLocationMethod(null);
        return;
      }
      const { lat, lng } = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords({ lat, lng });
      markerMovedRef.current = false;
      lastEditedRef.current = null;
      const geo = await reverseGeocodeAddress({ lat, lng });
      if (geo.city) setValue("city", geo.city, { shouldValidate: false });
      if (geo.postal_code && /^\d{4}$/.test(geo.postal_code)) {
        setValue("postal_code", geo.postal_code, { shouldValidate: false });
      }
    } catch {
      showErrorToast("Kunne ikke hente posisjon. Sjekk at du har gitt tilgang.");
      setLocationMethod(null);
    } finally {
      setLocationLoading(false);
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
          city: values.city || null,
          lat: finalCoords?.lat ?? null,
          lng: finalCoords?.lng ?? null,
          can_ship: fieldGroupKeys.includes("delivery-location")
            ? values.can_ship !== "pickup"
            : null,
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
            return { storage_path: path, sort_order: i };
          }),
        );
        setUploadProgress(null);
        const { error: imgErr } = await supabase.from("listing_images").insert(
          results.map((u) => ({
            listing_id: listing.id,
            storage_path: u.storage_path,
            sort_order: u.sort_order,
          })),
        );
        if (imgErr) throw imgErr;
      }

      return listing;
    },
    onSuccess: (result) => {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_ID_KEY);
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

  const conditionDescription = CONDITIONS.find((c) => c.value === condition)?.description;

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

  // Redirect to home if no type selected and no draft — entry should go through the picker dialog
  useEffect(() => {
    if (listingType === null && !hasDraftData) {
      void navigate({ to: "/" });
    }
  }, [listingType, hasDraftData, navigate]);

  const sharedProps: WizardSharedProps = {
    native,

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

    bilOgMcCategoryId,
    vehicleRegistered,
    setVehicleRegistered,
    vehicleLookupLoading,
    vehicleLookupError,
    vehicleLookupResult,
    vehicleClassification,
    vehiclePreviousClassificationMismatch,
    runVehicleLookup,
    matchVehicleBrandForLeaf,
    confirmVehicleData,
    rejectVehicleLookup,

    conditionDescription,

    wtbMatch,

    keywordsFetching,
    keywordSuggestions,
    appendTagToDescription,

    similarListings,

    images,
    setImages,
    uploadProgress,

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
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.removeItem(DRAFT_KEY);
              setHasDraftData(null);
            }}
          >
            Forkast
          </Button>
        </div>
      )}

      {/* Sticky step indicator */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur border-b border-border mt-4">
        <div className="flex items-center justify-between">
          <StepIndicator step={step} pages={pages} native={native} />
          {draftSaveError ? (
            <p className="text-xs text-destructive">Utkast ble ikke lagret</p>
          ) : (
            savedTimeLabel && <p className="text-xs text-muted-foreground">{savedTimeLabel}</p>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit((v) => {
          if (missingFilters.length > 0) {
            setAttributesTouched(true);
            if (categoryAttributesPageIndex >= 0) setStep(categoryAttributesPageIndex + 1);
            showErrorToast("Fyll inn alle obligatoriske egenskaper før du publiserer.");
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
                  <Button type="button" variant="ghost" onClick={() => window.history.back()}>
                    <ChevronLeft className="size-4" /> Tilbake
                  </Button>
                )}
                {!isLast ? (
                  <Button type="button" onClick={() => void goToNextPage()}>
                    Neste: {pageLabel(nextGroups, native)} <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <PublishActions
                    turnstileEnabled={turnstileEnabled}
                    turnstileToken={turnstileToken}
                    setTurnstileToken={setTurnstileToken}
                    mutationIsPending={mutation.isPending}
                    onCancel={() => navigate({ to: "/" })}
                  />
                )}
              </div>
            </div>
          );
        })()}
      </form>

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

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent onClickOutside={() => blocker.reset?.()}>
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
                localStorage.removeItem(DRAFT_KEY);
                localStorage.removeItem(DRAFT_ID_KEY);
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
