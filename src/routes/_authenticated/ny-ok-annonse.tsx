import { useEffect, useMemo, useState } from "react";
import { useIsNative } from "@/hooks/use-is-native";
import { createFileRoute, useNavigate, useBlocker, useRouter, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Check, Bell } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createWtbListing } from "@/lib/wtb-listings.functions";
import { createSavedSearch, summarizeCriteria } from "@/lib/saved-searches";
import { CategoryPicker } from "@/components/category-picker";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { WtbCriteriaFields } from "@/features/wtb/wtb-criteria-fields";
import {
  isWtbRangeValue,
  wtbInvalidCheckedKeys,
  type WtbAttributeMap,
} from "@/features/wtb/wtb-criteria-types";
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
import { NativePageHeader } from "@/components/native-page-header";
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

const wtbSchema = z.object({
  title: z.string().trim().min(3, "Tittelen må være minst 3 tegn").max(120, "Maks 120 tegn"),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional().or(z.literal("")),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z
    .union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")])
    .optional(),
});

type WtbForm = z.infer<typeof wtbSchema>;

export const Route = createFileRoute("/_authenticated/ny-ok-annonse")({
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
      <AlertCircle className="mx-auto size-10 text-destructive" />
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

type WtbStep = "category" | "attributes" | "details";
const STEPS: WtbStep[] = ["category", "attributes", "details"];
const STEP_LABELS: Record<WtbStep, string> = {
  category: "Kategori",
  attributes: "Søkekriterier",
  details: "Detaljer",
};

function NewWtbPage() {
  const native = useIsNative();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedSearch, setSavedSearch] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [attributes, setAttributes] = useState<WtbAttributeMap>({});
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [showCriteriaErrors, setShowCriteriaErrors] = useState(false);
  const [titleManualOverride, setTitleManualOverride] = useState(false);

  const step = STEPS[stepIndex];

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "with-color"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, parent_id, icon, color")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string }>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, touchedFields },
  } = useForm<WtbForm>({
    resolver: zodResolver(wtbSchema),
    defaultValues: {
      title: "",
      description: "",
      category_id: null,
      max_price_nok: "",
    },
  });

  const [categoryId, title, description] = useWatch({
    control,
    name: ["category_id", "title", "description"],
  });
  const titleLength = title.length;
  const descriptionLength = (description ?? "").length;

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

  const shouldBlockNav = !published && (title.trim().length > 0 || stepIndex > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => shouldBlockNav,
    withResolver: true,
    enableBeforeUnload: shouldBlockNav,
  });

  const createFn = useServerFn(createWtbListing);
  const { mutate: publish, isPending } = useMutation({
    mutationFn: async (values: WtbForm) => {
      const result = await createFn({
        data: {
          title: values.title,
          subtitle: null,
          description: values.description || undefined,
          category_id: values.category_id ?? null,
          max_price_nok: typeof values.max_price_nok === "number" ? values.max_price_nok : null,
          attributes,
        },
      });
      return result.id;
    },
    onSuccess: (id) => {
      setCreatedId(id);
      setPublished(true);
    },
    onError: (err) =>
      showErrorToast(formatErrorMessage(err, "Kunne ikke publisere annonsen. Prøv igjen.")),
  });

  const handleSaveSearch = async () => {
    if (!createdId) return;
    setSavingSearch(true);
    try {
      const criteria = {
        q: title.trim() || undefined,
        categories: categoryId ? [categoryId] : undefined,
      };
      const name = summarizeCriteria(criteria) || title.trim();
      await createSavedSearch(name, criteria, true);
      setSavedSearch(true);
      showSuccessToast("Søk lagret! Du varsles når noen legger ut en matching annonse.");
    } catch {
      showErrorToast("Kunne ikke lagre søket. Prøv igjen.");
    } finally {
      setSavingSearch(false);
    }
  };

  function goNext() {
    // A checked-but-empty criterion is required before moving on.
    if (step === "attributes" && wtbInvalidCheckedKeys(checkedKeys, attributes).length > 0) {
      setShowCriteriaErrors(true);
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  if (published) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-8 text-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">Ønskes kjøpt-annonse publisert!</h1>
          <p className="text-muted-foreground">
            Andre brukere som selger noe som matcher vil se at du er interessert.
          </p>
        </div>

        {!savedSearch && (
          <div className="w-full rounded-xl border bg-muted/40 p-4 text-left">
            <div className="mb-3 flex items-start gap-3">
              <Bell className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Vil du varsles om matchende annonser?</p>
                <p className="text-sm text-muted-foreground">
                  Vi sender deg et varsel når noen legger ut noe som treffer søket ditt.
                </p>
              </div>
            </div>
            <Button
              className="mt-1 w-full gap-2"
              onClick={handleSaveSearch}
              disabled={savingSearch}
            >
              <Bell className="size-4" />
              {savingSearch ? "Lagrer..." : "Aktiver varsler for dette søket"}
            </Button>
          </div>
        )}

        {savedSearch && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="size-4" />
            Søk lagret — du varsles ved treff!
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
          <Button onClick={() => navigate({ to: "/annonser" })}>Se alle annonser</Button>
          <Button variant="outline" onClick={() => navigate({ to: "/mine-annonser" })}>
            Mine annonser
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-4">
      <NativePageHeader title="Ønskes kjøpt" backTo="/" />
      {!native && <h1 className="font-display text-3xl tracking-tight">Ønskes kjøpt</h1>}

      {/* Step indicator */}
      <nav aria-label="Fremdrift i skjema" className="mt-4 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  n < stepIndex + 1
                    ? "bg-primary text-primary-foreground"
                    : n === stepIndex + 1
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {n < stepIndex + 1 ? <Check className="size-3.5" /> : n}
              </div>
              <span
                className={`text-xs ${
                  n === stepIndex + 1
                    ? "inline font-medium text-foreground"
                    : "hidden text-muted-foreground sm:inline"
                }`}
              >
                {STEP_LABELS[s]}
              </span>
              {n < STEPS.length && <div className="h-px w-6 shrink-0 bg-border" />}
            </div>
          );
        })}
      </nav>

      {/* Ingen <form>: publisering skjer kun via eksplisitt klikk på publiser-knappen,
          slik at verken Enter i input-felter eller knappe-bytte i footeren kan utløse den. */}
      <div className="mt-8 flex flex-col gap-6 pb-24">
        {step === "category" && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Kategori (valgfritt)</Label>
              <Button type="button" size="sm" variant="ghost" onClick={goNext}>
                Hopp over — jeg leter etter hva som helst
              </Button>
            </div>
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
          </section>
        )}

        {step === "attributes" && (
          <section className="space-y-2">
            {categoryLabel && (
              <p className="text-sm text-muted-foreground">
                Kategori: <span className="font-medium text-foreground">{categoryLabel}</span>
              </p>
            )}
            {!vehicleGroup && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="title">
                    Hva leter du etter? <span className="text-destructive">*</span>
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
                <Input
                  id="title"
                  placeholder="f.eks. PlayStation 5, Trek sykkel, iPhone 14..."
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
            <WtbCriteriaFields
              categoryId={categoryId ?? null}
              categories={categories}
              value={attributes}
              onChange={setAttributes}
              checkedKeys={checkedKeys}
              onCheckedKeysChange={setCheckedKeys}
              showErrors={showCriteriaErrors}
            />
            <div className="space-y-2 pt-4">
              <Label htmlFor="wtb-freetext">
                Fritekstsøk <span className="font-normal text-muted-foreground">(valgfritt)</span>
              </Label>
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
            </div>
          </section>
        )}

        {step === "details" && (
          <>
            {vehicleGroup && (
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
                <Label htmlFor="description">Beskrivelse / krav (valgfritt)</Label>
                <span className="text-xs text-muted-foreground">{descriptionLength}/2000</span>
              </div>
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
              <Label htmlFor="max_price">Maks pris du vil betale (valgfritt)</Label>
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

        <div
          className={`flex items-center border-t border-border pt-6 ${
            stepIndex === 0 ? "justify-end" : "justify-between"
          }`}
        >
          {stepIndex > 0 && (
            <Button type="button" variant="ghost" onClick={goBack}>
              <ChevronLeft className="size-4" /> Tilbake
            </Button>
          )}
          {step !== "details" ? (
            <Button
              type="button"
              onClick={goNext}
              disabled={step === "attributes" && !vehicleGroup && !title.trim()}
            >
              Neste: {STEP_LABELS[STEPS[stepIndex + 1]]} <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit((values) => publish(values))}
              disabled={isPending}
              className="gap-2"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Publiser ønskes kjøpt
            </Button>
          )}
        </div>
      </div>

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avbryte annonsen?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er i ferd med å forlate siden. Endringene dine vil gå tapt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Fortsett å redigere
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => blocker.proceed?.()}
            >
              Ja, avbryt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
