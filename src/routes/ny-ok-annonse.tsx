import { useEffect, useMemo, useRef, useState } from "react";
import { useIsNative } from "@/hooks/use-is-native";
import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showErrorToast } from "@/lib/toast";
import { ChevronLeft, ChevronRight, Loader2, Check, Bell } from "lucide-react";

import { useCategories, visibleCategories } from "@/hooks/use-categories";
import { useIsDemo } from "@/hooks/use-user-roles";
import { createWtbListing } from "@/lib/wtb-listings.functions";
import { lookupPostalCode } from "@/lib/geocode";
import { CATEGORY_SUGGESTION_LOADING_MESSAGE } from "@/features/listing-creation/use-category-suggestion-loading-message";
import { CategoryPicker } from "@/components/category-picker";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { WtbCriteriaFields } from "@/features/wtb/wtb-criteria-fields";
import {
  isWtbRangeValue,
  WTB_FREETEXT_KEY,
  type WtbAttributeMap,
} from "@/features/wtb/wtb-criteria-types";
import { wtbCriteriaSummary, wtbLocationLabel } from "@/features/wtb/wtb-criteria-presentation";
import { WtbListingPreview, type WtbPreviewSection } from "@/features/wtb/wtb-listing-preview";
import {
  WtbExistingMatchesBanner,
  WtbExistingMatchesList,
} from "@/features/wtb/wtb-existing-matches";
import { useWtbExistingMatches } from "@/features/wtb/use-wtb-existing-matches";
import {
  categoryBreadcrumb,
  effectiveFiltersForCategory,
  vehicleCategoryGroupFor,
  type CategoryNode,
} from "@/lib/category-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatErrorMessage } from "@/lib/errors";
import { trackProductEvent } from "@/lib/product-analytics";
import { ListingComposerShell } from "@/features/listing-creation/listing-composer-shell";
import { ComposerStepIndicator } from "@/features/listing-creation/step-indicator";
import { useComposerHistoryBack } from "@/features/listing-creation/use-composer-history";
import {
  composerForwardStep,
  type ComposerNavigationResult,
} from "@/features/listing-creation/composer-navigation";
import { NativeComposerDeck } from "@/features/listing-creation/native-composer-deck";
import { NewListingError } from "@/features/listing-creation/new-listing-error";
import { useTitleCategorySuggestion } from "@/features/listing-creation/use-title-category-suggestion";
import { useVehicleTitleCategoryHint } from "@/features/listing-creation/use-vehicle-title-category-hint";
import { useAuth } from "@/hooks/use-auth";
import { authResumeReturnTo, currentReturnTo } from "@/lib/auth-return";
import { useWtbDraftAutosave } from "@/features/wtb/use-wtb-draft-autosave";
import { DiscardListingDialog } from "@/features/listing-creation/discard-listing-dialog";
import { GuestPublishSheet } from "@/features/listing-creation/guest-publish-sheet";
import { Checkbox } from "@/components/ui/checkbox";

export const wtbSchema = z.object({
  title: z.string().trim().min(3, "Tittelen må være minst 3 tegn").max(120, "Maks 120 tegn"),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional().or(z.literal("")),
  category_id: z.string().uuid().nullable().optional(),
  // The empty-string branch has to come first: `z.coerce.number()` turns ""
  // into 0, so with the number branch first an empty (optional) max price
  // was stored as "maks 0 kr" — a wanted-ad nothing can ever match.
  max_price_nok: z
    .union([
      z.literal(""),
      z.coerce
        .number()
        .int("Prisen må være et helt tall")
        .min(0, "Prisen kan ikke være negativ")
        .max(10_000_000, "Prisen er for høy"),
    ])
    .optional(),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
    .optional()
    .or(z.literal("")),
});

type WtbForm = z.infer<typeof wtbSchema>;

export const Route = createFileRoute("/ny-ok-annonse")({
  validateSearch: z
    .object({
      title: z.string().optional(),
      resume: z.enum(["auth-publish"]).optional(),
    })
    .catch({}),
  head: () => ({
    meta: [
      { title: "Ønskes kjøpt — Kaupet.no" },
      {
        name: "description",
        content: "Legg ut en ønskes kjøpt-annonse og finn det du leter etter på Kaupet.no.",
      },
    ],
  }),
  component: NewWtbPage,
  errorComponent: NewListingError,
});

function FieldValid({ show }: { show: boolean }) {
  if (!show) return null;
  return <Check className="size-3.5 text-green-600" aria-hidden />;
}

/** "bmw" / "BMW" -> "Bmw" — mirrors title-photos/index.tsx's capitalizeWord,
 * kept local here since VehicleTitleFields is typed against the sell flow's
 * ListingFormShape and can't be reused as-is against WtbForm's register. */
function capitalizeWord(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

type WtbStep = "category" | "category-confirm" | "title" | "attributes" | "details" | "review";
// Tittelen får sitt eget steg før kategorien: kategoriforslaget bygger på
// den, og kategoristeget spør da bare om å bekrefte forslaget.
const BASE_STEPS: WtbStep[] = ["title", "category", "attributes", "details", "review"];

function stepMeta(step: WtbStep): { title: string; help: string } {
  switch (step) {
    case "category":
      return { title: "Velg kategori", help: "Kategorien avgjør hvilke annonser som gir treff." };
    case "category-confirm":
      return {
        title: "Bekreft kategori",
        help: "Vi har foreslått en kategori basert på tittelen din.",
      };
    case "title":
      return { title: "Hva leter du etter?", help: "Beskriv kort hva du leter etter." };
    case "attributes":
      return {
        title: "Hva er viktig for deg?",
        help: "Legg bare til krav som faktisk betyr noe — Kaupet bruker dem til å finne treff.",
      };
    case "details":
      return {
        title: "Siste detaljer",
        help: "Pris, område og beskrivelse gjør det lettere for selgere å se om de har det du leter etter.",
      };
    case "review":
      return {
        title: "Se over",
        help: "Slik ser selgerne kjøpsønsket ditt. Trykk på en del for å endre den.",
      };
  }
}

const RADIUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 10, label: "10 km" },
  { value: 25, label: "25 km" },
  { value: 50, label: "50 km" },
  { value: 100, label: "100 km" },
  { value: null, label: "Hele landet" },
];

function NewWtbPage() {
  const native = useIsNative();
  const { user } = useAuth();
  const { title: titleParam, resume } = Route.useSearch();
  // Set once from the initial search params: true when the wizard was
  // entered via the intent+title landing screen — skips the forced "category"
  // (and, on native, "title") step in favor of a category-confirm step after
  // "details", mirroring the same pattern in ny-annonse.tsx.
  const [skipCategoryStep] = useState(() => !!titleParam?.trim());
  // True once the user has resolved the category-confirm step (suggestion
  // click, manual pick, or "fortsett uten kategori") — removes
  // "category-confirm" from `steps` for the rest of the session, so "Neste"
  // never lands on it twice. See confirmCategory for where the wizard
  // continues afterwards.
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);
  const baseSteps = BASE_STEPS;
  const steps = useMemo(() => {
    if (!skipCategoryStep || categoryConfirmed) return baseSteps;
    // "attributes" flyttes ut sammen med "category" og settes inn igjen rett
    // etter category-confirm: kriteriefeltene er utledet fra kategorien, så
    // før den er valgt hadde steget ingenting å vise.
    const withoutCategory = baseSteps.filter(
      (s) => s !== "category" && s !== "title" && s !== "attributes",
    );
    const detailsIdx = withoutCategory.indexOf("details");
    const insertAt = detailsIdx === -1 ? withoutCategory.length : detailsIdx + 1;
    return [
      ...withoutCategory.slice(0, insertAt),
      "category-confirm" as const,
      "attributes" as const,
      ...withoutCategory.slice(insertAt),
    ];
  }, [baseSteps, skipCategoryStep, categoryConfirmed]);
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  // Varsling er hele poenget med et kjøpsønske — på som standard.
  const [notifyOnMatch, setNotifyOnMatch] = useState(true);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [guestPublishSheetOpen, setGuestPublishSheetOpen] = useState(false);
  const returnToReviewRef = useRef(false);
  const forwardBusyRef = useRef(false);
  const [attributes, setAttributes] = useState<WtbAttributeMap>({});
  const authResumeHandledRef = useRef(false);
  const bypassNavigationBlockerRef = useRef(false);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [titleManualOverride, setTitleManualOverride] = useState(false);
  const [categoryConfirmShowPicker, setCategoryConfirmShowPicker] = useState(false);
  const [postalLookup, setPostalLookup] = useState<{
    postalCode: string;
    result: Awaited<ReturnType<typeof lookupPostalCode>>;
  } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(50);

  const step = steps[stepIndex];
  const meta = stepMeta(step);

  const { data: allCategories = [] } = useCategories();
  const { data: isDemo = false } = useIsDemo();
  const categories = useMemo(
    () => visibleCategories(allCategories, isDemo),
    [allCategories, isDemo],
  );

  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string }>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);
  const bilOgMcCategoryId = useMemo(
    () => allCategories.find((c) => c.slug === "bil-og-mc" && !c.parent_id)?.id ?? null,
    [allCategories],
  );

  const {
    register,
    handleSubmit,
    trigger,
    control,
    setValue,
    formState: { errors, touchedFields },
  } = useForm<WtbForm>({
    resolver: zodResolver(wtbSchema),
    mode: "onTouched",
    defaultValues: {
      title: titleParam ?? "",
      description: "",
      category_id: null,
      max_price_nok: "",
      postal_code: "",
    },
  });
  const [categoryId, title, description, maxPriceNok, postalCode] = useWatch({
    control,
    name: ["category_id", "title", "description", "max_price_nok", "postal_code"],
  });
  const titleLength = title.length;
  const descriptionLength = (description ?? "").length;
  const validPostalCode = /^\d{4}$/.test(postalCode ?? "") ? postalCode! : "";
  const maxPriceNumber =
    typeof maxPriceNok === "number"
      ? maxPriceNok
      : typeof maxPriceNok === "string" && /^\d+$/.test(maxPriceNok.trim())
        ? Number(maxPriceNok)
        : null;

  // Postnummer → sted og postnummerets sentrum. Ikke GPS: området er et
  // grovt kriterium, og koordinatene er offentlige på kjøpsønsket. Oppslaget
  // lagres sammen med postnummeret det gjelder, så et utdatert svar aldri
  // vises for et nytt postnummer.
  useEffect(() => {
    if (!validPostalCode) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const r = await lookupPostalCode(validPostalCode);
      if (!cancelled) setPostalLookup({ postalCode: validPostalCode, result: r });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [validPostalCode]);
  const currentLookup = postalLookup?.postalCode === validPostalCode ? postalLookup : null;
  const city = currentLookup?.result?.city || null;
  const lookupResult = currentLookup?.result ?? null;
  const coords = useMemo(
    () => (lookupResult ? { lat: lookupResult.lat, lng: lookupResult.lng } : null),
    [lookupResult],
  );
  const postalLookupFailed = !!currentLookup && !currentLookup.result;

  const draftFields = useMemo(
    () => ({
      title,
      description: description ?? "",
      category_id: categoryId ?? null,
      max_price_nok: maxPriceNok,
      notify_matches: notifyOnMatch,
      attributes,
      checked_keys: checkedKeys,
      postal_code: postalCode ?? "",
      city,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      radius_km: radiusKm,
    }),
    [
      title,
      description,
      categoryId,
      maxPriceNok,
      notifyOnMatch,
      attributes,
      checkedKeys,
      postalCode,
      city,
      coords,
      radiusKm,
    ],
  );
  const {
    draftId,
    restorableDraft,
    lastSaved,
    draftSaveError,
    isSaving,
    saveToServer,
    flushLocalDraft,
    dismissRestore,
    discardDraft,
    clearAfterPublish,
  } = useWtbDraftAutosave(draftFields, !!user);

  const vehicleGroup = useMemo(
    () => vehicleCategoryGroupFor(categoryId ?? null, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );

  // Year is a from–to range criterion in the WTB flow, so the auto-title
  // renders it as "2015–2020" / "2015+" / "til 2020" rather than one year.
  const yearValue = attributes.year;
  const yearLabel = isWtbRangeValue(yearValue)
    ? yearValue.min != null && yearValue.max != null
      ? `${yearValue.min}–${yearValue.max}`
      : yearValue.min != null
        ? `${yearValue.min}+`
        : yearValue.max != null
          ? `til ${yearValue.max}`
          : null
    : typeof yearValue === "string" || typeof yearValue === "number"
      ? String(yearValue)
      : null;
  const computedTitle = vehicleGroup
    ? [yearLabel, capitalizeWord(attributes.brand), capitalizeWord(attributes.model)]
        .filter((v) => v !== undefined && v !== null && v !== "")
        .join(" ")
    : null;

  useEffect(() => {
    if (!vehicleGroup || titleManualOverride) return;
    if (computedTitle && computedTitle !== title) {
      setValue("title", computedTitle, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedTitle, vehicleGroup, titleManualOverride]);

  const categoryLabel = categoryId ? categoryBreadcrumb(categoryId, categoriesById) || null : null;

  // Samme motor som salgsflyten: stemmevektet tittel → kategori, med
  // kjøretøymerke/-karosseri som reserve når stemmene ikke gir noe.
  const clientCategoryHint = useVehicleTitleCategoryHint({
    title,
    allFilters,
    categories: allCategories,
    categoriesById,
    bilOgMcCategoryId,
  });
  const { categorySuggestions, categorySuggestionPending } = useTitleCategorySuggestion({
    title,
    muted: !!categoryId,
    clientCategoryHint,
  });

  const criteriaSummary = wtbCriteriaSummary(
    effectiveFiltersForCategory(categoryId ?? null, allFilters ?? [], categoriesById),
    attributes,
  );
  const locationLabel = wtbLocationLabel({
    postal_code: validPostalCode,
    city,
    radius_km: coords ? radiusKm : null,
  });

  const { data: existingMatches } = useWtbExistingMatches({
    categoryId: categoryId ?? null,
    maxPriceNok: maxPriceNumber,
    attributes,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    radiusKm: coords ? radiusKm : null,
  });

  const shouldBlockNav = !published && (title.trim().length > 0 || stepIndex > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => !bypassNavigationBlockerRef.current && shouldBlockNav,
    withResolver: true,
    enableBeforeUnload: shouldBlockNav,
  });

  const createFn = useServerFn(createWtbListing);
  const { mutate: publish, isPending } = useMutation({
    mutationFn: async (values: WtbForm) => {
      const ensuredDraftId = draftId ?? (await saveToServer());
      const result = await createFn({
        data: {
          ...(ensuredDraftId ? { draftId: ensuredDraftId } : {}),
          title: values.title,
          subtitle: null,
          description: values.description || undefined,
          category_id: values.category_id ?? null,
          max_price_nok: typeof values.max_price_nok === "number" ? values.max_price_nok : null,
          notify_matches: notifyOnMatch,
          attributes,
          postal_code: values.postal_code || null,
          city,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          radius_km: radiusKm,
        },
      });
      return result.id;
    },
    onSuccess: (id) => {
      clearAfterPublish();
      void import("@/lib/haptics").then((module) => module.hapticNotification("success"));
      setCreatedId(id);
      setPublished(true);
    },
    onError: (err) => {
      trackProductEvent("listing_publish_failed", { kind: "want", step });
      void import("@/lib/haptics").then((module) => module.hapticNotification("error"));
      showErrorToast(formatErrorMessage(err, "Kunne ikke publisere annonsen. Prøv igjen."));
    },
  });

  function goToStep(index: number) {
    setValidationError(null);
    setStepIndex(index);
    window.scrollTo({ top: 0 });
  }

  function goNext() {
    goToStep(
      composerForwardStep(
        Math.min(stepIndex + 1, steps.length - 1),
        steps.length - 1,
        returnToReviewRef.current,
      ),
    );
    returnToReviewRef.current = false;
  }

  const titleStep: WtbStep = "title";

  const detailsFields: (keyof WtbForm)[] = [
    "description",
    "max_price_nok",
    "postal_code",
    ...(vehicleGroup && !native ? (["title"] as const) : []),
  ];

  async function attemptNext(): Promise<ComposerNavigationResult> {
    if (step === "review") return "busy";
    if (forwardBusyRef.current) return "busy";
    forwardBusyRef.current = true;
    try {
      const valid =
        step === titleStep
          ? await trigger("title", { shouldFocus: true })
          : step === "details"
            ? await trigger(detailsFields, { shouldFocus: true })
            : true;
      if (!valid) {
        setValidationError("Rett feltene som er markert før du fortsetter.");
        setValidationAttempt((attempt) => attempt + 1);
        return "blocked";
      }
      goNext();
      return "advanced";
    } finally {
      forwardBusyRef.current = false;
    }
  }

  /** Kategoristeget: tittelen er allerede validert på forrige steg. */
  function chooseCategory(id: string | null) {
    setValue("category_id", id, { shouldValidate: true });
    goNext();
  }

  /** Avslutter category-confirm. Steglisten blir den vanlige igjen, så vi
   * setter eksplisitt kurs mot kriteriene — indeksen fra den forkortede
   * listen peker på et annet steg i den fulle. */
  function confirmCategory(id: string | null) {
    if (id) setValue("category_id", id, { shouldValidate: true });
    setCategoryConfirmed(true);
    goToStep(baseSteps.indexOf("attributes"));
  }

  function goBack() {
    // Mirrors the hidden Tilbake/Neste on category-confirm — single function
    // behind the footer button, the shell's header arrow, the native swipe
    // deck, AND the browser/hardware back button (useComposerHistoryBack
    // below), so guarding here keeps all four consistent at once.
    if (step === "category-confirm") return;
    returnToReviewRef.current = false;
    setValidationError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }
  useComposerHistoryBack(stepIndex === 0, goBack);

  function editSection(section: WtbPreviewSection) {
    const target: WtbStep =
      section === "title"
        ? vehicleGroup && !native
          ? "details"
          : titleStep
        : section === "category"
          ? "category"
          : section === "criteria"
            ? "attributes"
            : "details";
    const index = steps.indexOf(target);
    if (index === -1) return;
    returnToReviewRef.current = true;
    goToStep(index);
  }

  // Brukt av GuestPublishSheet: samme redirect-flyt som ble kalt direkte før
  // arket erstattet det umiddelbare navigasjonshoppet.
  function goToAuthFromGuestSheet(mode: "signin" | "signup") {
    if (!flushLocalDraft()) return;
    bypassNavigationBlockerRef.current = true;
    void navigate({
      to: "/auth",
      search: { mode, returnTo: authResumeReturnTo(currentReturnTo()) },
    });
  }

  function handleInvalid(fields: FieldErrors<WtbForm>) {
    const targetStep = fields.title
      ? steps.indexOf(vehicleGroup && !native ? "details" : titleStep)
      : fields.description || fields.max_price_nok || fields.postal_code
        ? steps.indexOf("details")
        : stepIndex;
    setStepIndex(targetStep === -1 ? stepIndex : targetStep);
    setValidationError("Rett feltene som er markert før du fortsetter.");
  }

  function restoreDraft() {
    if (!restorableDraft) return;
    setValue("title", restorableDraft.title);
    setValue("description", restorableDraft.description);
    setValue("category_id", restorableDraft.category_id);
    const restoredMaxPrice =
      typeof restorableDraft.max_price_nok === "number"
        ? restorableDraft.max_price_nok
        : restorableDraft.max_price_nok?.trim()
          ? Number(restorableDraft.max_price_nok)
          : "";
    setValue(
      "max_price_nok",
      typeof restoredMaxPrice === "number" && Number.isFinite(restoredMaxPrice)
        ? restoredMaxPrice
        : "",
    );
    setValue("postal_code", restorableDraft.postal_code ?? "");
    if (restorableDraft.radius_km !== undefined) setRadiusKm(restorableDraft.radius_km);
    setNotifyOnMatch(restorableDraft.notify_matches);
    setAttributes(restorableDraft.attributes);
    setCheckedKeys(restorableDraft.checked_keys);
    dismissRestore();
  }

  useEffect(() => {
    if (resume !== "auth-publish" || !user || !restorableDraft || authResumeHandledRef.current) {
      return;
    }
    authResumeHandledRef.current = true;
    restoreDraft();
    requestAnimationFrame(() => setStepIndex(steps.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, user?.id, restorableDraft]);

  if (published) {
    return (
      <div
        className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-8 text-primary" aria-hidden />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">Ønskes kjøpt-annonse publisert!</h1>
          <p className="text-muted-foreground">
            Andre brukere som selger noe som matcher vil se at du er interessert.
          </p>
        </div>

        {notifyOnMatch && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Bell className="size-4" aria-hidden />
            Du varsles når Kaupet finner et treff.
          </div>
        )}

        {existingMatches && (
          <WtbExistingMatchesList
            count={existingMatches.count}
            listings={existingMatches.listings}
          />
        )}

        <div className="flex w-full flex-col gap-2">
          <Button
            onClick={() =>
              createdId && navigate({ to: "/ok/$id", params: { id: createdId }, search: {} })
            }
          >
            Se kjøpsønsket
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: "/mine-annonser" })}>
            Mine annonser
          </Button>
        </div>
      </div>
    );
  }

  const preview = (
    <WtbListingPreview
      title={title}
      categoryLabel={categoryLabel}
      criteriaSummary={criteriaSummary}
      description={description ?? ""}
      maxPriceNok={maxPriceNumber}
      locationLabel={locationLabel}
    />
  );

  /** Kategorivalget på både "category" og "category-confirm": forslaget fra
   * tittelen som et ja/nei-spørsmål når vi har et, ellers (eller etter «Nei»)
   * kategorivelgeren. */
  const onChoose = (id: string | null) =>
    step === "category-confirm" ? confirmCategory(id) : chooseCategory(id);
  const categoryChoice = (
    <section className="space-y-3">
      {categoryConfirmShowPicker ||
      (categorySuggestions.length === 0 && !categorySuggestionPending) ? (
        <>
          <Label>Velg kategori</Label>
          <CategoryPicker
            inline
            open={false}
            onOpenChange={() => {}}
            categories={categories}
            selectedId={categoryId ?? ""}
            onSelect={(id) => onChoose(id)}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-12"
            onClick={() => onChoose(null)}
          >
            Jeg er usikker – fortsett uten kategori
          </Button>
        </>
      ) : categorySuggestions.length === 0 ? (
        <div className="space-y-4 py-6 text-center" role="status" aria-live="polite" aria-busy>
          <div className="mx-auto h-6 w-2/3 animate-pulse rounded bg-muted" />
          <p className="text-sm text-muted-foreground">{CATEGORY_SUGGESTION_LOADING_MESSAGE}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCategoryConfirmShowPicker(true)}
          >
            Velg kategori selv
          </Button>
        </div>
      ) : (
        <div className="space-y-4 py-4 text-center">
          <p className="text-lg font-semibold">
            {categorySuggestions.length > 1
              ? `Er kjøpsønsket i kategori ${categorySuggestions.map((s) => s.name_nb).join(" eller ")}?`
              : `Kjøpsønsket blir opprettet i kategori ${categoryBreadcrumb(categorySuggestions[0].category_id, categoriesById) || categorySuggestions[0].name_nb}. Er det riktig?`}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {categorySuggestions.map((s) => (
              <Button key={s.category_id} type="button" onClick={() => onChoose(s.category_id)}>
                {categorySuggestions.length > 1 ? s.name_nb : "Ja"}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryConfirmShowPicker(true)}
            >
              Nei, velg selv
            </Button>
          </div>
        </div>
      )}
    </section>
  );

  const isCategoryConfirmStep = step === "category-confirm";
  const nextStep = steps[stepIndex + 1];
  const footer = (
    <>
      {!native && stepIndex > 0 && !isCategoryConfirmStep && (
        <Button type="button" variant="ghost" onClick={goBack} className="hidden lg:inline-flex">
          <ChevronLeft className="size-4" aria-hidden /> Tilbake
        </Button>
      )}
      {isCategoryConfirmStep ? null : step !== "review" ? (
        <Button
          type="button"
          onClick={() => void attemptNext()}
          className={
            native
              ? "min-h-12 min-w-24 rounded-xl px-3 text-base"
              : "w-full h-14 text-base lg:h-11 lg:w-auto lg:text-sm"
          }
        >
          {native || !nextStep ? "Fortsett" : `Neste: ${stepMeta(nextStep).title}`}{" "}
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      ) : (
        <Button
          type="button"
          onClick={handleSubmit(
            (values) => {
              if (!user) {
                setGuestPublishSheetOpen(true);
                return;
              }
              publish(values);
            },
            (fields) => {
              handleInvalid(fields);
            },
          )}
          disabled={isPending}
          className={
            native
              ? "min-h-12 min-w-24 rounded-xl px-3 text-base"
              : "w-full h-14 gap-2 text-base lg:h-11 lg:w-auto lg:text-sm"
          }
        >
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {user ? (native ? "Publiser" : "Publiser ønskes kjøpt") : "Logg inn og publiser"}
        </Button>
      )}
    </>
  );

  const titleField = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="title">
          Tittel <span className="text-destructive">*</span>
        </Label>
        <span className="text-xs text-muted-foreground">{titleLength}/120</span>
      </div>
      <Input
        id="title"
        placeholder="f.eks. PlayStation 5, Trek sykkel eller iPhone 14"
        autoFocus
        aria-invalid={!!errors.title}
        aria-describedby={errors.title ? "title-error" : undefined}
        {...register("title", {
          // Som før: bare native-kortet regnes som manuell tittel; på web kan
          // kjøretøytittelen fortsatt fylles ut fra årsmodell/merke/modell.
          onChange: native ? () => setTitleManualOverride(true) : undefined,
        })}
      />
      {errors.title && (
        <p id="title-error" className="text-sm text-destructive">
          {errors.title.message}
        </p>
      )}
    </div>
  );

  return (
    <>
      <ListingComposerShell
        title="Ønskes kjøpt"
        pageKey={step}
        pageTitle={meta.title}
        native={native}
        backLabel={stepIndex === 0 ? "Avbryt" : "Tilbake"}
        onBack={
          stepIndex === 0
            ? () => void navigate({ to: "/" })
            : isCategoryConfirmStep
              ? undefined
              : goBack
        }
        onCancel={() => void navigate({ to: "/" })}
        notice={
          restorableDraft ? (
            <div className="mt-4 flex flex-col items-stretch gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                {restorableDraft.title.trim()
                  ? `Utkast for annonse "${restorableDraft.title}" er lagret. Vil du fortsette der du slapp?`
                  : "Du har et lagret utkast. Vil du fortsette der du slapp?"}
              </span>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="native-touch-target"
                  onClick={restoreDraft}
                >
                  Gjenopprett
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="native-touch-target"
                  onClick={discardDraft}
                >
                  Forkast
                </Button>
              </div>
            </div>
          ) : undefined
        }
        progress={
          <ComposerStepIndicator
            current={stepIndex + 1}
            total={steps.length}
            label={meta.title}
            stepLabels={steps.map((s) => stepMeta(s).title)}
            onSelectStep={(target) => goToStep(target - 1)}
          />
        }
        status={
          isSaving ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-1 text-right text-xs text-muted-foreground"
            >
              Lagrer utkast …
            </p>
          ) : draftSaveError ? (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-1 text-right text-xs text-destructive"
            >
              Utkast ble ikke lagret
            </p>
          ) : lastSaved ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-1 text-right text-xs text-muted-foreground"
            >
              Utkast lagret kl.{" "}
              {lastSaved.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : undefined
        }
        errorSummary={validationError}
        validationAttempt={validationAttempt}
        footer={footer}
        firstStep={stepIndex === 0}
        contentClassName="flex flex-col gap-6"
        // På Se over er hovedkolonnen allerede kjøpsønsket — ingen dobbel visning.
        preview={step !== "review" ? preview : undefined}
        previewLabel="Slik ser selgerne kjøpsønsket"
        previewSection={
          step === "attributes" ? "criteria" : step === "details" ? "details" : "title"
        }
      >
        <NativeComposerDeck
          enabled={native}
          onBack={stepIndex === 0 || isCategoryConfirmStep ? undefined : goBack}
          onForward={attemptNext}
        >
          <p className="text-sm text-muted-foreground">{meta.help}</p>
          {/* Ingen <form>: publisering skjer kun via eksplisitt klikk på publiser-knappen,
          slik at verken Enter i input-felter eller knappe-bytte i footeren kan utløse den. */}
          {step === "title" && <section>{titleField}</section>}

          {(step === "category" || step === "category-confirm") && categoryChoice}

          {step === "attributes" && (
            <section className="space-y-4">
              {categoryLabel && (
                <p className="text-sm text-muted-foreground">
                  Kategori: <span className="font-medium text-foreground">{categoryLabel}</span>
                </p>
              )}
              <WtbCriteriaFields
                categoryId={categoryId ?? null}
                categories={categories}
                value={attributes}
                onChange={setAttributes}
                checkedKeys={checkedKeys}
                onCheckedKeysChange={setCheckedKeys}
                native={native}
              />
              <div className="space-y-2">
                <Label htmlFor="wtb-keywords">
                  Nøkkelord for treff{" "}
                  <span className="font-normal text-muted-foreground">(valgfritt)</span>
                </Label>
                <p id="wtb-keywords-help" className="text-xs text-muted-foreground">
                  Da får du bare treff på annonser der ordet står i tittelen eller beskrivelsen,
                  f.eks. en utstyrskode. Vises ikke i annonsen.
                </p>
                <Input
                  id="wtb-keywords"
                  aria-describedby="wtb-keywords-help"
                  placeholder="f.eks. utstyrskode"
                  value={
                    typeof attributes[WTB_FREETEXT_KEY] === "string"
                      ? attributes[WTB_FREETEXT_KEY]
                      : ""
                  }
                  onChange={(e) =>
                    setAttributes((prev) => {
                      const next = { ...prev };
                      if (e.target.value) next[WTB_FREETEXT_KEY] = e.target.value;
                      else delete next[WTB_FREETEXT_KEY];
                      return next;
                    })
                  }
                />
              </div>
              <WtbExistingMatchesBanner count={existingMatches?.count} />
            </section>
          )}

          {step === "details" && (
            <>
              {vehicleGroup && !native && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="title">
                      Tittel <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <FieldValid show={!!touchedFields.title && !errors.title} />
                      <span
                        className={`text-xs ${titleLength > 100 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {titleLength}/120
                      </span>
                    </div>
                  </div>
                  {!titleManualOverride ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                      <span className={computedTitle ? "" : "text-muted-foreground"}>
                        {computedTitle || "Fylles ut fra Årsmodell, Merke og Modell"}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="native-touch-target"
                        onClick={() => setTitleManualOverride(true)}
                      >
                        Rediger manuelt
                      </Button>
                    </div>
                  ) : (
                    <Input
                      id="title"
                      placeholder="f.eks. 2019 BMW 320d"
                      autoFocus
                      aria-invalid={!!errors.title}
                      aria-describedby={errors.title ? "title-error" : undefined}
                      {...register("title")}
                    />
                  )}
                  {errors.title && (
                    <p id="title-error" className="text-sm text-destructive">
                      {errors.title.message}
                    </p>
                  )}
                </section>
              )}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">
                    Beskrivelse / krav{" "}
                    <span className="font-normal text-muted-foreground">(valgfritt)</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">{descriptionLength}/2000</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fritekst som vises i annonsen din, slik at selgere kan lese hva du ønsker.
                </p>
                <Textarea
                  id="description"
                  placeholder="Beskriv gjerne ønsket stand, farge, versjon, o.l."
                  rows={3}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? "description-error" : undefined}
                  {...register("description")}
                />
                {errors.description && (
                  <p id="description-error" className="text-sm text-destructive">
                    {errors.description.message}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <Label htmlFor="max_price">
                  Maks pris du vil betale{" "}
                  <span className="font-normal text-muted-foreground">(valgfritt)</span>
                </Label>
                <Input
                  id="max_price"
                  type="number"
                  inputMode="numeric"
                  placeholder="kr"
                  className="max-w-[200px]"
                  min={0}
                  max={10000000}
                  aria-invalid={!!errors.max_price_nok}
                  aria-describedby={errors.max_price_nok ? "max-price-error" : undefined}
                  {...register("max_price_nok")}
                />
                {errors.max_price_nok && (
                  <p id="max-price-error" className="text-sm text-destructive">
                    {errors.max_price_nok.message}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="postal_code">
                    Område <span className="font-normal text-muted-foreground">(valgfritt)</span>
                  </Label>
                  <p id="postal-code-help" className="text-xs text-muted-foreground">
                    Postnummeret du vil hente i nærheten av. Annonser som kan sendes, matcher
                    uansett avstand.
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      id="postal_code"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Postnummer"
                      className="w-36"
                      aria-invalid={!!errors.postal_code}
                      aria-describedby={
                        errors.postal_code
                          ? "postal-code-error postal-code-help"
                          : "postal-code-help"
                      }
                      {...register("postal_code")}
                    />
                    {city && <p className="text-sm text-muted-foreground">{city}</p>}
                  </div>
                  {errors.postal_code && (
                    <p id="postal-code-error" className="text-sm text-destructive">
                      {errors.postal_code.message}
                    </p>
                  )}
                  {postalLookupFailed && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Fant ikke sted for dette postnummeret. Sjekk at det stemmer.
                    </p>
                  )}
                </div>
                {coords && (
                  <div className="space-y-2">
                    <Label id="wtb-radius-label">Avstand</Label>
                    <RadioGroup
                      aria-labelledby="wtb-radius-label"
                      value={radiusKm == null ? "all" : String(radiusKm)}
                      onValueChange={(v) => setRadiusKm(v === "all" ? null : Number(v))}
                      className="flex flex-wrap gap-2"
                    >
                      {RADIUS_OPTIONS.map((option) => {
                        const value = option.value == null ? "all" : String(option.value);
                        return (
                          <Label
                            key={value}
                            htmlFor={`wtb-radius-${value}`}
                            className="native-touch-target flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-border px-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                          >
                            <RadioGroupItem id={`wtb-radius-${value}`} value={value} />
                            {option.label}
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  </div>
                )}
              </section>
              <WtbExistingMatchesBanner count={existingMatches?.count} />
            </>
          )}

          {step === "review" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card">
                <WtbListingPreview
                  title={title}
                  categoryLabel={categoryLabel}
                  criteriaSummary={criteriaSummary}
                  description={description ?? ""}
                  maxPriceNok={maxPriceNumber}
                  locationLabel={locationLabel}
                  onEdit={editSection}
                />
              </div>
              <WtbExistingMatchesBanner count={existingMatches?.count} />
              <label
                htmlFor="notify-on-match"
                aria-label="Varsle meg om matchende annonser"
                className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 text-left"
              >
                <Checkbox
                  id="notify-on-match"
                  checked={notifyOnMatch}
                  onCheckedChange={(checked) => setNotifyOnMatch(checked === true)}
                  aria-describedby="notify-on-match-help"
                />
                <span>
                  <span className="block font-medium">Varsle meg om matchende annonser</span>
                  <span
                    id="notify-on-match-help"
                    className="mt-1 block text-sm text-muted-foreground"
                  >
                    Kaupet varsler deg når en ny annonse matcher kategorien og kriteriene du har
                    valgt.
                  </span>
                </span>
              </label>
              {isPending && (
                <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                  Publiserer kjøpsønsket …
                </p>
              )}
            </div>
          )}
        </NativeComposerDeck>
      </ListingComposerShell>

      <DiscardListingDialog
        open={blocker.status === "blocked"}
        onReset={() => blocker.reset?.()}
        onDiscard={async () => {
          await discardDraft();
          blocker.proceed?.();
        }}
        onSaveDraft={async () => {
          if (!user) {
            if (!flushLocalDraft()) return false;
            blocker.proceed?.();
            return true;
          }
          const id = await saveToServer();
          if (!id) return false;
          blocker.proceed?.();
          return true;
        }}
        isSavingDraft={isSaving}
        saveDraftLabel="Lagre som utkast"
      />

      <GuestPublishSheet
        open={guestPublishSheetOpen}
        onOpenChange={setGuestPublishSheetOpen}
        onSignIn={() => goToAuthFromGuestSheet("signin")}
        onSignUp={() => goToAuthFromGuestSheet("signup")}
      />
    </>
  );
}
