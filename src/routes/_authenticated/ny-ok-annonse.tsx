import { useEffect, useMemo, useRef, useState } from "react";
import { useIsNative } from "@/hooks/use-is-native";
import { createFileRoute, useNavigate, useBlocker, useRouter, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showErrorToast } from "@/lib/toast";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Check, Bell } from "lucide-react";

import { useCategories, visibleCategories } from "@/hooks/use-categories";
import { useIsDemo } from "@/hooks/use-is-demo";
import { createWtbListing } from "@/lib/wtb-listings.functions";
import { prefetchCategorySuggestion } from "@/lib/category-suggestion.functions";
import { useCategorySuggestionLoadingMessage } from "@/features/listing-creation/use-category-suggestion-loading-message";
import { CategoryPicker } from "@/components/category-picker";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { WtbCriteriaFields } from "@/features/wtb/wtb-criteria-fields";
import { isWtbRangeValue, type WtbAttributeMap } from "@/features/wtb/wtb-criteria-types";
import {
  categoryBreadcrumb,
  vehicleCategoryGroupFor,
  type CategoryNode,
} from "@/lib/category-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatErrorMessage } from "@/lib/errors";
import { trackProductEvent } from "@/lib/product-analytics";
import { ListingComposerShell } from "@/features/listing-creation/listing-composer-shell";
import { ComposerStepIndicator } from "@/features/listing-creation/step-indicator";
import { ComposerReview } from "@/features/listing-creation/composer-review";
import { useComposerHistoryBack } from "@/features/listing-creation/use-composer-history";
import {
  composerForwardStep,
  type ComposerNavigationResult,
} from "@/features/listing-creation/composer-navigation";
import { NativeComposerDeck } from "@/features/listing-creation/native-composer-deck";
import { useWtbDraftAutosave } from "@/features/wtb/use-wtb-draft-autosave";
import { DiscardListingDialog } from "@/features/listing-creation/discard-listing-dialog";
import { Checkbox } from "@/components/ui/checkbox";

const wtbSchema = z.object({
  title: z.string().trim().min(3, "Tittelen må være minst 3 tegn").max(120, "Maks 120 tegn"),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional().or(z.literal("")),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z
    .union([
      z.coerce
        .number()
        .int("Prisen må være et helt tall")
        .min(0, "Prisen kan ikke være negativ")
        .max(10_000_000, "Prisen er for høy"),
      z.literal(""),
    ])
    .optional(),
});

type WtbForm = z.infer<typeof wtbSchema>;

export const Route = createFileRoute("/_authenticated/ny-ok-annonse")({
  validateSearch: z.object({ title: z.string().optional() }).catch({}),
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
  errorComponent: NewWtbError,
});

function NewWtbError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <AlertCircle className="mx-auto size-10 text-destructive" aria-hidden />
      <h1 className="mt-4 font-display text-2xl">Noe gikk galt</h1>
      <p className="mt-2 text-muted-foreground">{formatErrorMessage(error, "Ukjent feil")}</p>
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
const WEB_STEPS: WtbStep[] = ["category", "attributes", "details", "review"];
const NATIVE_STEPS: WtbStep[] = ["category", "title", "attributes", "details", "review"];
const STEP_META: Record<WtbStep, { title: string; help: string }> = {
  category: {
    title: "Hva leter du etter?",
    help: "Velg kategorien som passer best.",
  },
  "category-confirm": {
    title: "Bekreft kategori",
    help: "Vi har foreslått en kategori basert på tittelen din.",
  },
  title: {
    title: "Gi kjøpsønsket en tittel",
    help: "Beskriv kort hva du leter etter.",
  },
  attributes: {
    title: "Hva er viktig for deg?",
    help: "Legg bare til begrensninger som faktisk betyr noe.",
  },
  details: {
    title: "Siste detaljer",
    help: "Gjør kjøpsønsket tydelig før du publiserer.",
  },
  review: {
    title: "Se over",
    help: "Kontroller opplysningene og velg om du vil varsles om treff.",
  },
};

function NewWtbPage() {
  const native = useIsNative();
  const { title: titleParam } = Route.useSearch();
  // Set once from the initial search params: true when the wizard was
  // entered via the intent+title landing screen — skips the forced "category"
  // (and, on native, "title") step in favor of a category-confirm step after
  // "details", mirroring the same pattern in ny-annonse.tsx.
  const [skipCategoryStep] = useState(() => !!titleParam?.trim());
  // True once the user has resolved the category-confirm step (suggestion
  // click, manual pick, or "fortsett uten kategori") — removes
  // "category-confirm" from `steps` for the rest of the session, mirroring
  // ny-annonse.tsx's categoryConfirmed: the page it occupied just disappears,
  // so "Neste" never lands on it twice and "Tilbake" from "review" goes
  // straight to "details" instead of back into it.
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);
  const steps = useMemo(() => {
    const base = native ? NATIVE_STEPS : WEB_STEPS;
    if (!skipCategoryStep || categoryConfirmed) return base;
    const withoutCategory = base.filter((s) => s !== "category" && s !== "title");
    const detailsIdx = withoutCategory.indexOf("details");
    const insertAt = detailsIdx === -1 ? withoutCategory.length : detailsIdx + 1;
    return [
      ...withoutCategory.slice(0, insertAt),
      "category-confirm" as const,
      ...withoutCategory.slice(insertAt),
    ];
  }, [native, skipCategoryStep, categoryConfirmed]);
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [notifyOnMatch, setNotifyOnMatch] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const returnToReviewRef = useRef(false);
  const forwardBusyRef = useRef(false);
  const [attributes, setAttributes] = useState<WtbAttributeMap>({});
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [titleManualOverride, setTitleManualOverride] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<
    { category_id: string; name_nb: string }[]
  >([]);
  const [categorySuggestionLoading, setCategorySuggestionLoading] = useState(false);
  const [categoryConfirmShowPicker, setCategoryConfirmShowPicker] = useState(false);
  const suggestionFiredImmediatelyRef = useRef(false);
  const categoryLoadingMessage = useCategorySuggestionLoadingMessage(
    !categoryConfirmShowPicker && categorySuggestionLoading && categorySuggestions.length === 0,
  );

  const step = steps[stepIndex];

  useEffect(() => {
    trackProductEvent("listing_creation_started", { kind: "want" });
  }, []);
  useEffect(() => {
    trackProductEvent("listing_creation_step_completed", {
      kind: "want",
      action: "viewed",
      step,
      stepNumber: stepIndex + 1,
    });
  }, [step, stepIndex]);

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
    },
  });

  const [categoryId, title, description, maxPriceNok] = useWatch({
    control,
    name: ["category_id", "title", "description", "max_price_nok"],
  });
  const titleLength = title.length;
  const descriptionLength = (description ?? "").length;
  const draftFields = useMemo(
    () => ({
      title,
      description: description ?? "",
      category_id: categoryId ?? null,
      max_price_nok: maxPriceNok,
      attributes,
      checked_keys: checkedKeys,
    }),
    [title, description, categoryId, maxPriceNok, attributes, checkedKeys],
  );
  const {
    draftId,
    restorableDraft,
    lastSaved,
    draftSaveError,
    isSaving,
    saveToServer,
    dismissRestore,
    discardDraft,
    clearAfterPublish,
  } = useWtbDraftAutosave(draftFields);

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
  const parsedMaxPrice = maxPriceNok === "" ? null : Number(maxPriceNok);

  useEffect(() => {
    if (categoryId || title.trim().length < 5) return;
    const fireImmediately = skipCategoryStep && !suggestionFiredImmediatelyRef.current;
    if (fireImmediately) suggestionFiredImmediatelyRef.current = true;
    // Synchronous so the category-confirm step's skeleton shows immediately,
    // not one tick late (mirrors use-listing-title-hints.ts's same toggle).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategorySuggestionLoading(true);
    const timeout = window.setTimeout(
      () => {
        void prefetchCategorySuggestion(title.trim())
          .then((result) => setCategorySuggestions(result.suggestions))
          .catch(() => setCategorySuggestions([]))
          .finally(() => setCategorySuggestionLoading(false));
      },
      fireImmediately ? 0 : 400,
    );
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, title]);

  const shouldBlockNav = !published && (title.trim().length > 0 || stepIndex > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => shouldBlockNav,
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
        },
      });
      return result.id;
    },
    onSuccess: (id) => {
      clearAfterPublish();
      trackProductEvent("listing_published", { kind: "want" });
      void import("@/lib/haptics").then((module) => module.hapticNotification("success"));
      setCreatedId(id);
      setPublished(true);
    },
    onError: (err) => {
      trackProductEvent("listing_creation_step_completed", {
        kind: "want",
        action: "publish_failed",
        step,
      });
      void import("@/lib/haptics").then((module) => module.hapticNotification("error"));
      showErrorToast(formatErrorMessage(err, "Kunne ikke publisere annonsen. Prøv igjen."));
    },
  });

  function goNext() {
    setValidationError(null);
    trackProductEvent("listing_creation_step_completed", {
      kind: "want",
      action: "completed",
      step,
      stepNumber: stepIndex + 1,
    });
    setStepIndex((i) =>
      composerForwardStep(
        Math.min(i + 1, steps.length - 1),
        steps.length - 1,
        returnToReviewRef.current,
      ),
    );
    returnToReviewRef.current = false;
    window.scrollTo({ top: 0 });
  }

  async function attemptNext(): Promise<ComposerNavigationResult> {
    if (step === "review") return "busy";
    if (forwardBusyRef.current) return "busy";
    forwardBusyRef.current = true;
    try {
      const valid =
        step === "title"
          ? await trigger("title", { shouldFocus: true })
          : step === "details"
            ? await trigger(native ? ["description", "max_price_nok"] : undefined, {
                shouldFocus: true,
              })
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
  function goBack() {
    // Mirrors the hidden Tilbake/Neste on category-confirm — single function
    // behind the footer button, the shell's header arrow, the native swipe
    // deck, AND the browser/hardware back button (useComposerHistoryBack
    // below), so guarding here keeps all four consistent at once.
    if (step === "category-confirm") return;
    returnToReviewRef.current = false;
    setValidationError(null);
    trackProductEvent("listing_creation_step_completed", {
      kind: "want",
      action: "back",
      step,
      stepNumber: stepIndex + 1,
    });
    setStepIndex((i) => Math.max(i - 1, 0));
  }
  useComposerHistoryBack(stepIndex === 0, goBack);

  function handleInvalid(fields: FieldErrors<WtbForm>) {
    const targetStep = fields.title
      ? steps.indexOf(native ? "title" : "category")
      : fields.description || fields.max_price_nok
        ? steps.indexOf("details")
        : stepIndex;
    setStepIndex(targetStep);
    setValidationError("Rett feltene som er markert før du fortsetter.");
  }

  function restoreDraft() {
    if (!restorableDraft) return;
    setValue("title", restorableDraft.title);
    setValue("description", restorableDraft.description);
    setValue("category_id", restorableDraft.category_id);
    setValue("max_price_nok", restorableDraft.max_price_nok);
    setAttributes(restorableDraft.attributes);
    setCheckedKeys(restorableDraft.checked_keys);
    dismissRestore();
    trackProductEvent("listing_creation_step_completed", {
      kind: "want",
      action: "draft_restored",
      step,
    });
  }

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

  const isCategoryConfirmStep = step === "category-confirm";
  const footer = (
    <>
      {!native && stepIndex > 0 && !isCategoryConfirmStep && (
        <Button type="button" variant="ghost" onClick={goBack}>
          <ChevronLeft className="size-4" aria-hidden /> Tilbake
        </Button>
      )}
      {isCategoryConfirmStep ? null : step !== "review" ? (
        <Button
          type="button"
          onClick={() => void attemptNext()}
          disabled={!native && step === "attributes" && !vehicleGroup && !title.trim()}
          aria-describedby={
            !native && step === "attributes" && !vehicleGroup && !title.trim()
              ? "wtb-continue-requirement"
              : undefined
          }
          className={native ? "min-h-12 min-w-24 rounded-xl px-3 text-base" : undefined}
        >
          {native ? "Fortsett" : `Neste: ${STEP_META[steps[stepIndex + 1]].title}`}{" "}
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      ) : (
        <Button
          type="button"
          onClick={handleSubmit(
            (values) => {
              trackProductEvent("listing_creation_step_completed", {
                kind: "want",
                action: "publish_started",
                step,
              });
              publish(values);
            },
            (fields) => {
              handleInvalid(fields);
              trackProductEvent("listing_creation_step_completed", {
                kind: "want",
                action: "validation_failed",
                step,
                reason: "publish_form",
              });
            },
          )}
          disabled={isPending}
          className={native ? "min-h-12 min-w-24 rounded-xl px-3 text-base" : "gap-2"}
        >
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {native ? "Publiser" : "Publiser ønskes kjøpt"}
        </Button>
      )}
    </>
  );

  return (
    <>
      <ListingComposerShell
        title="Ønskes kjøpt"
        pageKey={step}
        pageTitle={STEP_META[step].title}
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
            label={STEP_META[step].title}
          />
        }
        status={
          isSaving ? (
            <p className="mt-1 text-right text-xs text-muted-foreground">Lagrer utkast …</p>
          ) : draftSaveError ? (
            <p className="mt-1 text-right text-xs text-destructive">Utkast ble ikke lagret</p>
          ) : lastSaved ? (
            <p className="mt-1 text-right text-xs text-muted-foreground">
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
      >
        <NativeComposerDeck
          enabled={native}
          onBack={stepIndex === 0 || isCategoryConfirmStep ? undefined : goBack}
          onForward={attemptNext}
        >
          <p className="text-sm text-muted-foreground">{STEP_META[step].help}</p>
          {/* Ingen <form>: publisering skjer kun via eksplisitt klikk på publiser-knappen,
          slik at verken Enter i input-felter eller knappe-bytte i footeren kan utløse den. */}
          {step === "category" && (
            <section className="space-y-3">
              {!native && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="title">Kort beskrivelse</Label>
                    <span className="text-xs text-muted-foreground">{titleLength}/120</span>
                  </div>
                  <Input
                    id="title"
                    placeholder="f.eks. PlayStation 5, Trek sykkel eller iPhone 14"
                    autoFocus
                    aria-invalid={!!errors.title}
                    aria-describedby={errors.title ? "title-error" : undefined}
                    {...register("title")}
                  />
                  {errors.title && (
                    <p id="title-error" className="text-sm text-destructive">
                      {errors.title.message}
                    </p>
                  )}
                </div>
              )}
              {!native && !categoryId && categorySuggestions.length > 0 && (
                <div className="space-y-2">
                  {categorySuggestions.map((s) => (
                    <button
                      key={s.category_id}
                      type="button"
                      className="flex min-h-14 w-full items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left"
                      onClick={() => {
                        setValue("category_id", s.category_id, { shouldValidate: true });
                        setCategorySuggestions([]);
                      }}
                    >
                      <span>
                        <span className="block text-sm text-muted-foreground">
                          Foreslått kategori
                        </span>
                        <span className="font-medium">{s.name_nb}</span>
                      </span>
                      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
              <Label>Velg kategori</Label>
              <CategoryPicker
                inline
                open={false}
                onOpenChange={() => {}}
                categories={categories}
                selectedId={categoryId ?? ""}
                onSelect={(id) => {
                  setValue("category_id", id, { shouldValidate: true });
                  goNext();
                }}
              />
              <Button type="button" size="sm" variant="ghost" className="min-h-12" onClick={goNext}>
                Jeg er usikker – fortsett uten kategori
              </Button>
            </section>
          )}

          {step === "category-confirm" && (
            <section className="space-y-3">
              {categoryConfirmShowPicker ||
              (categorySuggestions.length === 0 && !categorySuggestionLoading) ? (
                <>
                  <Label>Velg kategori</Label>
                  <CategoryPicker
                    inline
                    open={false}
                    onOpenChange={() => {}}
                    categories={categories}
                    selectedId={categoryId ?? ""}
                    onSelect={(id) => {
                      setValue("category_id", id, { shouldValidate: true });
                      setCategoryConfirmed(true);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-12"
                    onClick={() => setCategoryConfirmed(true)}
                  >
                    Jeg er usikker – fortsett uten kategori
                  </Button>
                </>
              ) : categorySuggestionLoading || categorySuggestions.length === 0 ? (
                <div className="space-y-4 py-6 text-center">
                  <div className="mx-auto h-6 w-2/3 animate-pulse rounded bg-muted" />
                  <p className="text-sm text-muted-foreground">{categoryLoadingMessage}</p>
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
                      ? `Er denne annonsen i kategori ${categorySuggestions.map((s) => s.name_nb).join(" eller ")}?`
                      : `Denne annonsen blir opprettet i kategori ${categorySuggestions[0].name_nb}. Er det riktig?`}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {categorySuggestions.map((s) => (
                      <Button
                        key={s.category_id}
                        type="button"
                        onClick={() => {
                          setValue("category_id", s.category_id, { shouldValidate: true });
                          setCategorySuggestions([]);
                          setCategoryConfirmed(true);
                        }}
                      >
                        {s.name_nb}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCategoryConfirmShowPicker(true)}
                    >
                      Nei
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {step === "title" && (
            <section className="space-y-2">
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
                {...register("title", { onChange: () => setTitleManualOverride(true) })}
              />
              {errors.title && (
                <p id="title-error" className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </section>
          )}

          {step === "attributes" && (
            <section className="space-y-2">
              {!native && !vehicleGroup && !title.trim() && (
                <p id="wtb-continue-requirement" className="text-sm text-destructive">
                  Legg inn en kort beskrivelse på første steg før du fortsetter.
                </p>
              )}
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
                <Label htmlFor="wtb-freetext">
                  Fritekstsøk <span className="font-normal text-muted-foreground">(valgfritt)</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Brukes til å matche annonsen din mot søk fra selgere, f.eks. en utstyrskode. Vises
                  ikke i annonsen.
                </p>
                <Input
                  id="wtb-freetext"
                  placeholder="Utstyrskode eller annen relevant informasjon"
                  value={typeof attributes.__freetext === "string" ? attributes.__freetext : ""}
                  onChange={(e) =>
                    setAttributes((prev) => {
                      const next = { ...prev };
                      if (e.target.value) next.__freetext = e.target.value;
                      else delete next.__freetext;
                      return next;
                    })
                  }
                />
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
            </>
          )}

          {step === "review" && (
            <div className="space-y-6">
              <ComposerReview
                items={[
                  {
                    key: "category",
                    label: "Kategori",
                    value: categoryLabel || "Ikke valgt",
                    onEdit: () => {
                      returnToReviewRef.current = true;
                      setStepIndex(0);
                    },
                  },
                  {
                    key: "criteria",
                    label: "Kriterier",
                    value:
                      Object.keys(attributes).length > 0
                        ? `${Object.keys(attributes).length} valgt`
                        : "Ingen begrensninger",
                    onEdit: () => {
                      returnToReviewRef.current = true;
                      setStepIndex(steps.indexOf("attributes"));
                    },
                  },
                  {
                    key: "title",
                    label: "Hva du leter etter",
                    value: title,
                    onEdit: () => {
                      returnToReviewRef.current = true;
                      setStepIndex(steps.indexOf(native ? "title" : "category"));
                    },
                  },
                  {
                    key: "details",
                    label: "Detaljer",
                    value:
                      [
                        description || null,
                        parsedMaxPrice !== null && Number.isFinite(parsedMaxPrice)
                          ? `Maks ${parsedMaxPrice.toLocaleString("nb-NO")} kr`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Ingen ekstra detaljer",
                    onEdit: () => {
                      returnToReviewRef.current = true;
                      setStepIndex(steps.indexOf("details"));
                    },
                  },
                ]}
              />
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
          const id = await saveToServer();
          if (!id) return false;
          blocker.proceed?.();
          return true;
        }}
        isSavingDraft={isSaving}
        saveDraftLabel="Lagre som utkast"
      />
    </>
  );
}
