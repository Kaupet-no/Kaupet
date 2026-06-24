import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2, MapPin, Tag } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createListing } from "@/lib/listings.functions";
import { uploadListingImage } from "@/lib/storage";
import {
  geocodeNorwayAddress,
  lookupPostalCode,
  lookupCity,
  reverseGeocodeAddress,
} from "@/lib/geocode";
import { ImageUploader, type PendingImage } from "@/components/image-uploader";
import { ListingLocationPicker } from "@/components/listing-location-picker";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { PublishedListingDialog } from "@/components/published-listing-dialog";
import { Turnstile } from "@marsidev/react-turnstile";

import { useIsDemo } from "@/lib/use-is-demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatErrorMessage } from "@/lib/errors";
import { CONDITIONS } from "@/lib/constants";
import { suggestCategoryForTitle } from "@/lib/category-suggestion.functions";

const listingSchema = z
  .object({
    title: z.string().trim().min(5, "Tittelen må være minst 5 tegn").max(120, "Maks 120 tegn"),
    description: z
      .string()
      .trim()
      .min(20, "Skriv litt mer — minst 20 tegn")
      .max(4000, "Maks 4000 tegn"),
    category_id: z.string().uuid("Velg en kategori"),
    condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]),
    is_free: z.boolean(),
    can_ship: z.enum(["pickup", "ship", "both"]),
    price_nok: z.union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")]).optional(),
    postal_code: z
      .string()
      .trim()
      .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
      .optional()
      .or(z.literal("")),
    city: z.string().trim().max(100).optional().or(z.literal("")),
  })
  .refine((d) => d.is_free || (typeof d.price_nok === "number" && d.price_nok >= 0), {
    message: "Sett en pris eller marker som gratis",
    path: ["price_nok"],
  });

type ListingForm = z.infer<typeof listingSchema>;

const DRAFT_KEY = "kaupet_draft_ny_annonse";
const NOR_STOPWORDS = new Set([
  "og",
  "er",
  "en",
  "et",
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
  "nye",
  "ny",
  "god",
  "lite",
  "litt",
  "stor",
  "selger",
  "selges",
  "kjøper",
  "kjøpes",
  "pris",
  "brukt",
  "gammel",
]);

export const Route = createFileRoute("/_authenticated/ny-annonse")({
  head: () => ({
    meta: [
      { title: "Ny annonse — Kaupet.no" },
      { name: "description", content: "Legg ut en gratis annonse på Kaupet.no." },
    ],
  }),
  component: NewListingPage,
});

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Bilder & tittel", "Detaljer", "Lokasjon"];
  return (
    <nav aria-label="Fremdrift i skjema" className="flex items-center gap-2">
      {([1, 2, 3] as const).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              s < step
                ? "bg-primary text-primary-foreground"
                : s === step
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "bg-muted text-muted-foreground"
            }`}
            aria-label={`Steg ${s}: ${labels[s - 1]}${s < step ? " (fullført)" : s === step ? " (pågår)" : ""}`}
          >
            {s < step ? <Check className="size-3.5" /> : s}
          </div>
          <span
            className={`hidden text-xs sm:inline ${s === step ? "font-medium text-foreground" : "text-muted-foreground"}`}
          >
            {labels[s - 1]}
          </span>
          {s < 3 && (
            <div className={`h-px w-6 shrink-0 ${s < step ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </nav>
  );
}

function FieldValid({ show }: { show: boolean }) {
  if (!show) return null;
  return <Check className="size-4 shrink-0 text-green-500" aria-hidden />;
}

function NewListingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraftData, setHasDraftData] = useState<Record<string, unknown> | null>(null);
  const { data: isDemo = false } = useIsDemo();
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories", "with-parent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, parent_id")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const parentCategories = (categories ?? []).filter((c) => !c.parent_id);
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const subcategories = (categories ?? []).filter((c) => c.parent_id === selectedParentId);

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
  const description = watch("description");
  const priceNok = watch("price_nok");

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastEdited = useRef<"postal_code" | "city" | "map" | null>(null);
  const markerMoved = useRef(false);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const data = JSON.parse(saved) as Record<string, unknown>;
      const savedAt = typeof data.saved_at === "number" ? data.saved_at : 0;
      if (Date.now() - savedAt < 7 * 24 * 60 * 60 * 1000) {
        if (data.title || data.description) setHasDraftData(data);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  // Autosave to localStorage on field changes
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            title,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
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

  function restoreDraft() {
    if (!hasDraftData) return;
    if (typeof hasDraftData.title === "string") setValue("title", hasDraftData.title);
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
    if (typeof hasDraftData.postal_code === "string")
      setValue("postal_code", hasDraftData.postal_code);
    if (typeof hasDraftData.city === "string") setValue("city", hasDraftData.city);
    if (typeof hasDraftData.selectedParentId === "string")
      setSelectedParentId(hasDraftData.selectedParentId);
    if (typeof hasDraftData.category_id === "string")
      setValue("category_id", hasDraftData.category_id);
    setHasDraftData(null);
    toast.success("Utkast gjenopprettet!");
  }

  // Auto-fill city from postal code
  useEffect(() => {
    if (lastEdited.current !== "postal_code") return;
    const p = (postalCode ?? "").trim();
    if (!/^\d{4}$/.test(p)) return;
    const t = window.setTimeout(async () => {
      const r = await lookupPostalCode(p);
      if (!r) return;
      if (r.city) setValue("city", r.city, { shouldValidate: false });
      if (!markerMoved.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
  }, [postalCode, setValue]);

  // Auto-fill postal from city
  useEffect(() => {
    if (lastEdited.current !== "city") return;
    const c = (city ?? "").trim();
    if (c.length < 2) return;
    const t = window.setTimeout(async () => {
      const r = await lookupCity(c);
      if (!r) return;
      if (r.postal_code && !(postalCode ?? "").trim()) {
        setValue("postal_code", r.postal_code, { shouldValidate: false });
      }
      if (!markerMoved.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, setValue]);

  // Reverse-geocode map position
  useEffect(() => {
    if (lastEdited.current !== "map" || !coords) return;
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
      const firstWord = debouncedTitle.trim().split(/\s+/)[0] ?? "";
      if (firstWord.length < 3) return [];
      const { data } = await supabase
        .from("listings")
        .select("id, title, price_nok, is_free, city")
        .eq("category_id", categoryId)
        .eq("status", "active")
        .ilike("title", `%${firstWord}%`)
        .limit(3);
      return data ?? [];
    },
  });

  // Smart keyword suggestions from title
  const smartTags = useMemo(() => {
    const words = (title ?? "")
      .toLowerCase()
      .replace(/[^a-zæøå0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !NOR_STOPWORDS.has(w));
    return [...new Set(words)].slice(0, 5);
  }, [title]);

  function appendTagToDescription(tag: string) {
    const current = (description ?? "").trimEnd();
    const next = current ? `${current} ${tag}` : tag;
    setValue("description", next, { shouldTouch: false });
  }

  async function goToStep2() {
    const valid = await trigger(["title"]);
    if (!valid) return;
    if (images.length === 0) {
      toast.warning("Tips: Annonser med bilder selger mye raskere!");
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function goToStep3() {
    const valid = await trigger(["description", "category_id", "condition", "price_nok"]);
    if (!valid) return;
    setStep(3);
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
          title: values.title,
          description: values.description,
          category_id: values.category_id,
          condition: values.condition,
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
          can_ship: values.can_ship !== "pickup",
          turnstileToken,
        },
      });

      const uploaded: { storage_path: string; sort_order: number }[] = [];
      if (images.length > 0) setUploadProgress({ done: 0, total: images.length });
      for (let i = 0; i < images.length; i++) {
        const path = await uploadListingImage({
          userId,
          listingId: listing.id,
          index: i,
          file: images[i].file,
        });
        uploaded.push({ storage_path: path, sort_order: i });
        setUploadProgress({ done: i + 1, total: images.length });
      }
      setUploadProgress(null);
      if (uploaded.length > 0) {
        const { error: imgErr } = await supabase.from("listing_images").insert(
          uploaded.map((u) => ({
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
      void import("@/lib/haptics").then((m) => m.hapticNotification("success"));
      toast.success("Annonsen er publisert");
      setPublishedId(result.id);
      setPublishedCode(result.kaupet_code);
      setPublishedOpen(true);
    },
    onError: (err: Error) => {
      setUploadProgress(null);
      void import("@/lib/haptics").then((m) => m.hapticNotification("error"));
      toast.error(formatErrorMessage(err, "Kunne ikke publisere annonsen"));
    },
  });

  const conditionDescription = CONDITIONS.find((c) => c.value === condition)?.description;

  const previewPrice = isFree
    ? "Gratis"
    : typeof priceNok === "number" && priceNok >= 0
      ? `${priceNok.toLocaleString("nb-NO")} kr`
      : null;

  const savedTimeLabel = lastSaved
    ? `Utkast lagret kl. ${lastSaved.getHours().toString().padStart(2, "0")}:${lastSaved.getMinutes().toString().padStart(2, "0")}`
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl tracking-tight">Ny annonse</h1>
      <p className="mt-1 text-muted-foreground">
        Det er gratis å legge ut annonser. Fyll inn det viktigste — du kan redigere senere.
      </p>

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

      {/* Step indicator */}
      <div className="mt-6 flex items-center justify-between">
        <StepIndicator step={step} />
        {savedTimeLabel && <p className="text-xs text-muted-foreground">{savedTimeLabel}</p>}
      </div>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-8">
        {/* ── Step 1: Bilder & tittel ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-8">
            <section className="space-y-2">
              <Label>
                Bilder{" "}
                <span className="font-normal text-muted-foreground">(anbefalt — maks 8)</span>
              </Label>
              <ImageUploader images={images} onChange={setImages} uploadProgress={uploadProgress} />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Tittel</Label>
                <div className="flex items-center gap-1.5">
                  <FieldValid show={!!touchedFields.title && !errors.title} />
                  <span className="text-xs text-muted-foreground">
                    {(title ?? "").length} / 120
                  </span>
                </div>
              </div>
              <Input
                id="title"
                placeholder="F.eks. Trek Marlin 5 sykkel 2022 — sort, lite brukt"
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? "title-error" : undefined}
                {...register("title")}
              />
              {errors.title && (
                <p id="title-error" className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
              {/* Search result preview */}
              {(title ?? "").length >= 5 && !errors.title && (
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Slik ser tittelen ut i søk:{" "}
                  <span className="font-medium text-foreground">{title}</span>
                </div>
              )}
            </section>

            <div className="flex justify-end border-t border-border pt-6">
              <Button type="button" onClick={() => void goToStep2()}>
                Neste: Detaljer <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Detaljer ────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-8">
            {/* Description */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Beskrivelse</Label>
                <div className="flex items-center gap-1.5">
                  <FieldValid show={!!touchedFields.description && !errors.description} />
                  <span className="text-xs text-muted-foreground">
                    {(description ?? "").length} / 4000
                  </span>
                </div>
              </div>
              {/* Smart keyword suggestions */}
              {smartTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-xs text-muted-foreground">
                    Tips til søkeord du kan legge til i annonsen:
                  </span>
                  {smartTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => appendTagToDescription(tag)}
                      className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                id="description"
                rows={8}
                placeholder="Beskriv tilstand, alder, hvorfor du selger, og om henting/sending."
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

            {/* Category + condition */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Kategori</Label>
                  <FieldValid show={!!touchedFields.category_id && !errors.category_id} />
                </div>
                {categorySuggestion && !categoryTouchedManually && (
                  <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
                    <span>
                      Forslag:{" "}
                      {categorySuggestion.parent_name_nb
                        ? `${categorySuggestion.parent_name_nb} › ${categorySuggestion.name_nb}`
                        : categorySuggestion.name_nb}{" "}
                      — bruk denne?
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={applyCategorySuggestion}
                    >
                      Bruk
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSuggestionDismissed(true);
                        setCategorySuggestion(null);
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                )}
                <Select
                  value={selectedParentId}
                  onValueChange={(v) => {
                    setCategoryTouchedManually(true);
                    setSelectedParentId(v);
                    const hasSubs = (categories ?? []).some((c) => c.parent_id === v);
                    if (!hasSubs) {
                      setValue("category_id", v, { shouldValidate: true });
                    } else {
                      setValue("category_id", "", { shouldValidate: false });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-invalid={!!errors.category_id}
                    aria-describedby={errors.category_id ? "category-error" : undefined}
                  >
                    <SelectValue placeholder="Velg hovedkategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_nb}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedParentId && subcategories.length > 0 && (
                  <Select
                    value={categoryId}
                    onValueChange={(v) => {
                      setCategoryTouchedManually(true);
                      setValue("category_id", v, { shouldValidate: true });
                    }}
                  >
                    <SelectTrigger
                      aria-invalid={!!errors.category_id}
                      aria-describedby={errors.category_id ? "category-error" : undefined}
                    >
                      <SelectValue placeholder="Velg underkategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {subcategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name_nb}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.category_id && (
                  <p id="category-error" className="text-sm text-destructive">
                    {errors.category_id.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Tilstand</Label>
                <Select
                  value={condition}
                  onValueChange={(v) =>
                    setValue("condition", v as ListingForm["condition"], { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {conditionDescription && (
                  <p className="text-xs text-muted-foreground">{conditionDescription}</p>
                )}
              </div>
            </section>

            {/* Similar listings */}
            {similarListings && similarListings.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Lignende annonser i samme kategori
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {similarListings.map((l) => (
                    <li key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="line-clamp-1 flex-1 text-foreground">{l.title}</span>
                      <span className="ml-3 shrink-0 text-muted-foreground">
                        {l.is_free
                          ? "Gratis"
                          : typeof l.price_nok === "number"
                            ? `${l.price_nok.toLocaleString("nb-NO")} kr`
                            : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Bruk dette som peilesnor for riktig pris.
                </p>
              </section>
            )}

            {/* Price */}
            <section className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Label>Pris</Label>
                <FieldValid
                  show={
                    (!!touchedFields.price_nok || isFree) &&
                    !errors.price_nok &&
                    (isFree || typeof priceNok === "number")
                  }
                />
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  placeholder="kr"
                  disabled={isFree}
                  className="max-w-[200px]"
                  aria-invalid={!!errors.price_nok}
                  aria-describedby={errors.price_nok ? "price-error" : undefined}
                  {...register("price_nok")}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={isFree}
                    onCheckedChange={(v) => setValue("is_free", Boolean(v))}
                  />
                  Gis bort gratis
                </label>
              </div>
              {errors.price_nok && (
                <p id="price-error" className="text-sm text-destructive">
                  {errors.price_nok.message as string}
                </p>
              )}
            </section>

            <div className="flex items-center justify-between border-t border-border pt-6">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="size-4" /> Tilbake
              </Button>
              <Button type="button" onClick={() => void goToStep3()}>
                Neste: Lokasjon <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Sted & publiser ──────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-8">
            {/* Preview card */}
            <section className="space-y-2">
              <Label>Forhåndsvisning</Label>
              <p className="text-xs text-muted-foreground">Slik ser annonsen ut for kjøpere.</p>
              <div className="overflow-hidden rounded-xl border border-border bg-card sm:max-w-xs">
                <div className="aspect-[4/3] bg-muted">
                  {images[0] ? (
                    <img
                      src={images[0].previewUrl}
                      alt=""
                      className="size-full object-cover"
                      aria-hidden
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      Ingen bilde
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{title || "—"}</p>
                  {previewPrice && <p className="font-display text-base">{previewPrice}</p>}
                  {city && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {city}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Delivery options */}
            <section className="space-y-3">
              <Label>Levering</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: "pickup", label: "Må hentes", description: "Kjøper henter selv" },
                    { value: "ship", label: "Må sendes", description: "Selger sender" },
                    {
                      value: "both",
                      label: "Begge deler",
                      description: "Kan både hentes og sendes",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValue("can_ship", opt.value, { shouldValidate: true })}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center text-sm transition-colors ${
                      canShip === opt.value
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Location */}
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="postal_code">Postnummer</Label>
                  <Input
                    id="postal_code"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0150"
                    aria-invalid={!!errors.postal_code}
                    aria-describedby={errors.postal_code ? "postal-code-error" : undefined}
                    {...register("postal_code", {
                      onChange: () => {
                        lastEdited.current = "postal_code";
                        markerMoved.current = false;
                      },
                    })}
                  />
                  {errors.postal_code && (
                    <p id="postal-code-error" className="text-sm text-destructive">
                      {errors.postal_code.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Sted</Label>
                  <Input
                    id="city"
                    placeholder="Oslo"
                    {...register("city", {
                      onChange: () => {
                        lastEdited.current = "city";
                        markerMoved.current = false;
                      },
                    })}
                  />
                </div>
              </div>
              {coords && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Dra markøren for å justere hvilket område som skal vises i annonsen.
                  </p>
                  <ListingLocationPicker
                    lat={coords.lat}
                    lng={coords.lng}
                    onChange={(next) => {
                      markerMoved.current = true;
                      lastEdited.current = "map";
                      setCoords(next);
                    }}
                  />
                </div>
              )}
            </section>

            <div className="flex items-center justify-between border-t border-border pt-6">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                <ChevronLeft className="size-4" /> Tilbake
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate({ to: "/" })}
                  disabled={mutation.isPending}
                >
                  Avbryt
                </Button>
                {turnstileEnabled && (
                  <Turnstile
                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken(null)}
                    options={{ size: "invisible" }}
                  />
                )}
                <Button
                  type="submit"
                  disabled={mutation.isPending || (turnstileEnabled && !turnstileToken)}
                >
                  {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Publiser annonse
                </Button>
              </div>
            </div>
          </div>
        )}
      </form>

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
