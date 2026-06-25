import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  MapPin,
  Tag,
  LocateFixed,
  Hash,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createListing, saveDraftListing } from "@/lib/listings.functions";
import { uploadListingImage } from "@/lib/storage";
import { geocodeNorwayAddress, lookupPostalCode, reverseGeocodeAddress } from "@/lib/geocode";
import { ImageUploader, type PendingImage } from "@/components/image-uploader";
import { ListingLocationPicker } from "@/components/listing-location-picker";
import { FullscreenLocationPicker } from "@/components/fullscreen-location-picker";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { PublishedListingDialog } from "@/components/published-listing-dialog";
import { CategoryPicker } from "@/components/category-picker";
import { Turnstile } from "@marsidev/react-turnstile";

import { useIsDemo } from "@/lib/use-is-demo";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
import { getCurrentPosition, requestLocationPermission, isNative } from "@/lib/native";

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
  head: () => ({
    meta: [
      { title: "Ny annonse — Kaupet.no" },
      { name: "description", content: "Legg ut en gratis annonse på Kaupet.no." },
    ],
  }),
  component: NewListingPage,
});

function StepIndicator({ step, native }: { step: 1 | 2 | 3 | 4 | 5; native: boolean }) {
  if (native) {
    const labels = ["Tittel", "Detaljer", "Beskrivelse", "Sted", "Publiser"];
    return (
      <nav aria-label="Fremdrift i skjema" className="flex items-center gap-1.5">
        {([1, 2, 3, 4, 5] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                s < step
                  ? "bg-primary text-primary-foreground"
                  : s === step
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
              }`}
              aria-label={`Steg ${s}: ${labels[s - 1]}${s < step ? " (fullført)" : s === step ? " (pågår)" : ""}`}
            >
              {s < step ? <Check className="size-3" /> : s}
            </div>
            <span
              className={`hidden text-xs lg:inline ${s === step ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {labels[s - 1]}
            </span>
            {s < 5 && (
              <div className={`h-px w-4 shrink-0 ${s < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </nav>
    );
  }

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
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
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
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftSaveInProgress = useRef(false);
  const [showNoImageDialog, setShowNoImageDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMethod, setLocationMethod] = useState<"gps" | "postal" | null>(null);
  const [fullscreenMapOpen, setFullscreenMapOpen] = useState(false);
  const native = isNative();
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
      try {
        localStorage.setItem(DRAFT_ID_KEY, result.id);
      } catch {
        // ignore
      }
    } catch {
      // Silent — draft save is best-effort
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

  async function goToStep2() {
    const valid = await trigger(["title"]);
    if (!valid) return;
    if (images.length === 0) {
      setShowNoImageDialog(true);
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function goToStep3() {
    const fields: (keyof ListingForm)[] = native
      ? ["category_id", "condition", "price_nok"]
      : ["description", "category_id", "condition", "price_nok"];
    const valid = await trigger(fields);
    if (!valid) return;
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function goToStep4() {
    const valid = await trigger(["description"]);
    if (!valid) return;
    setStep(4);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToStep5() {
    setStep(5);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetLocationMethod() {
    setLocationMethod(null);
    setCoords(null);
    setValue("postal_code", "");
    setValue("city", "");
    markerMoved.current = false;
    lastEdited.current = null;
  }

  function switchToPostal() {
    setCoords(null);
    setValue("postal_code", "");
    setValue("city", "");
    markerMoved.current = false;
    lastEdited.current = null;
    setLocationMethod("postal");
  }

  function switchToGps() {
    setValue("postal_code", "");
    setValue("city", "");
    markerMoved.current = false;
    lastEdited.current = null;
    void useMyLocation();
  }

  async function useMyLocation() {
    setLocationMethod("gps");
    setLocationLoading(true);
    try {
      if (isNative()) {
        const permission = await requestLocationPermission();
        if (permission !== "granted") {
          toast.error("Gi appen tilgang til posisjon i innstillingene.");
          setLocationMethod(null);
          return;
        }
      }
      const pos = await getCurrentPosition();
      if (!pos) {
        toast.error("Kunne ikke hente posisjon.");
        setLocationMethod(null);
        return;
      }
      const { lat, lng } = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords({ lat, lng });
      markerMoved.current = false;
      lastEdited.current = null;
      const geo = await reverseGeocodeAddress({ lat, lng });
      if (geo.city) setValue("city", geo.city, { shouldValidate: false });
      if (geo.postal_code && /^\d{4}$/.test(geo.postal_code)) {
        setValue("postal_code", geo.postal_code, { shouldValidate: false });
      }
    } catch {
      toast.error("Kunne ikke hente posisjon. Sjekk at du har gitt tilgang.");
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
  const selectedCategory = (categories ?? []).find((c) => c.id === categoryId);
  const selectedParent = selectedParentId
    ? (categories ?? []).find((c) => c.id === selectedParentId)
    : null;
  const categoryLabel =
    selectedCategory && selectedParent && selectedParent.id !== selectedCategory.id
      ? `${selectedParent.name_nb} › ${selectedCategory.name_nb}`
      : (selectedCategory?.name_nb ?? null);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-4">
      <h1 className="font-display text-3xl tracking-tight">Ny annonse</h1>

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
          <StepIndicator step={step} native={native} />
          {savedTimeLabel && <p className="text-xs text-muted-foreground">{savedTimeLabel}</p>}
        </div>
      </div>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className={`mt-8 ${native ? (step >= 3 ? "overflow-hidden" : "pb-[calc(var(--app-bottom-nav-h)+1.5rem)]") : "pb-24"}`}
      >
        {/* ══ WEB: original 3-step flow ══════════════════════════════════ */}

        {/* ── Web Step 1: Bilder & tittel ─────────────────────────────── */}
        {!native && step === 1 && (
          <div className="space-y-6">
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
            </section>

            <div className="flex justify-end border-t border-border pt-6">
              <Button type="button" onClick={() => void goToStep2()}>
                Neste: Detaljer <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Web Step 2: Detaljer ────────────────────────────────────── */}
        {!native && step === 2 && (
          <div className="space-y-6">
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
              <Textarea
                id="description"
                rows={5}
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

            <section className="space-y-2">
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

              <button
                type="button"
                onClick={() => setCategoryPickerOpen(true)}
                aria-invalid={!!errors.category_id}
                aria-describedby={errors.category_id ? "category-error" : undefined}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                  errors.category_id
                    ? "border-destructive"
                    : categoryLabel
                      ? "border-border bg-card"
                      : "border-border bg-card text-muted-foreground"
                } hover:border-primary/40`}
              >
                <span>{categoryLabel ?? "Velg kategori..."}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>

              {errors.category_id && (
                <p id="category-error" className="text-sm text-destructive">
                  {errors.category_id.message}
                </p>
              )}
            </section>

            <section className="space-y-2">
              <Label>Tilstand</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CONDITIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      setValue("condition", c.value as ListingForm["condition"], {
                        shouldValidate: true,
                      })
                    }
                    className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      condition === c.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {c.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {categoryId &&
              (keywordsFetching || (keywordSuggestions && keywordSuggestions.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {keywordsFetching && (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                  )}
                  {keywordSuggestions?.map(({ word }) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => appendTagToDescription(word)}
                      className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              )}

            {similarListings && similarListings.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Lignende annonser</p>
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
              </section>
            )}

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

        {/* ── Web Step 3: Sted & publiser ──────────────────────────────── */}
        {!native && step === 3 && (
          <div className="space-y-6">
            <section className="space-y-2">
              <Label>Forhåndsvisning</Label>
              <p className="text-xs text-muted-foreground">
                Dette er slik annonsen din vil se ut i søkelisten
              </p>
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:max-w-[220px]">
                <div className="aspect-square bg-muted">
                  {images[0] ? (
                    <img
                      src={images[0].previewUrl}
                      alt=""
                      className="size-full object-cover"
                      aria-hidden
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs">Ingen bilde</span>
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{title || "—"}</p>
                  {previewPrice && (
                    <p className="font-display text-base font-semibold">{previewPrice}</p>
                  )}
                  {(city || postalCode) && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {city || postalCode}
                    </p>
                  )}
                  {categoryLabel && (
                    <p className="text-xs text-muted-foreground truncate">{categoryLabel}</p>
                  )}
                </div>
              </div>
            </section>

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

            <section className="space-y-4">
              <Label>Sted</Label>
              {locationMethod === null && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void useMyLocation()}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-accent active:scale-95"
                  >
                    <LocateFixed className="size-6 text-primary" />
                    <span className="text-sm font-medium">Bruk min posisjon</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationMethod("postal")}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-accent active:scale-95"
                  >
                    <Hash className="size-6 text-primary" />
                    <span className="text-sm font-medium">Skriv inn postnummer</span>
                  </button>
                </div>
              )}
              {locationMethod === "gps" && (
                <div className="space-y-3">
                  {locationLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Henter posisjon…
                    </div>
                  ) : coords ? (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        <MapPin className="mr-1 inline size-3.5" />
                        {[postalCode, city].filter(Boolean).join(" ") || "Posisjon funnet"}
                      </p>
                      <button
                        type="button"
                        onClick={switchToPostal}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Benytt postnummer isteden
                      </button>
                    </div>
                  ) : null}
                  {coords && (
                    <div className="space-y-2">
                      {native ? (
                        <div
                          className="relative cursor-pointer"
                          onClick={() => setFullscreenMapOpen(true)}
                        >
                          <ListingLocationPicker
                            lat={coords.lat}
                            lng={coords.lng}
                            onChange={() => {}}
                            readOnly
                          />
                          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                            <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
                              Trykk for å justere lokasjonen på annonsen
                            </span>
                          </div>
                        </div>
                      ) : (
                        <ListingLocationPicker
                          lat={coords.lat}
                          lng={coords.lng}
                          onChange={(next) => {
                            markerMoved.current = true;
                            lastEdited.current = "map";
                            setCoords(next);
                          }}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Denne lokasjonen vises på annonsen din. Bare omtrentlig posisjon er synlig
                        for andre.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {locationMethod === "postal" && (
                <div className="space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="w-36 space-y-2">
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
                    {city && <p className="pb-2 text-sm text-muted-foreground">{city}</p>}
                    <button
                      type="button"
                      onClick={switchToGps}
                      className="mb-2 ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Bruk min posisjon isteden
                    </button>
                  </div>
                  {coords && (
                    <div className="space-y-2">
                      {native ? (
                        <div
                          className="relative cursor-pointer"
                          onClick={() => setFullscreenMapOpen(true)}
                        >
                          <ListingLocationPicker
                            lat={coords.lat}
                            lng={coords.lng}
                            onChange={() => {}}
                            readOnly
                          />
                          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                            <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
                              Trykk for å justere lokasjonen på annonsen
                            </span>
                          </div>
                        </div>
                      ) : (
                        <ListingLocationPicker
                          lat={coords.lat}
                          lng={coords.lng}
                          onChange={(next) => {
                            markerMoved.current = true;
                            lastEdited.current = "map";
                            setCoords(next);
                          }}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Denne lokasjonen vises på annonsen din. Bare omtrentlig posisjon er synlig
                        for andre.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {uploadProgress && (
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  Laster opp bilde {uploadProgress.done} av {uploadProgress.total}…
                </p>
                <Progress value={(uploadProgress.done / uploadProgress.total) * 100} />
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-6">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                <ChevronLeft className="size-4" /> Tilbake
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCancelDialog(true)}
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

        {/* ══ NATIVE: new 5-step flow ════════════════════════════════════ */}

        {/* ── Native Step 1: Tittel & bilder ─────────────────────────────────── */}
        {native && step === 1 && (
          <div className="space-y-6">
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
            </section>

            <section className="space-y-2">
              <Label>
                Bilder{" "}
                <span className="font-normal text-muted-foreground">(anbefalt — maks 8)</span>
              </Label>
              <ImageUploader images={images} onChange={setImages} uploadProgress={uploadProgress} />
            </section>

            <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-h)] z-40 flex justify-end bg-background/95 px-4 pt-3 pb-3 backdrop-blur border-t border-border">
              <Button type="button" onClick={() => void goToStep2()}>
                Neste: Detaljer <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Native Step 2: Detaljer ────────────────────────────────────────── */}
        {native && step === 2 && (
          <div className="space-y-6">
            {/* Category */}
            <section className="space-y-2">
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

              <button
                type="button"
                onClick={() => setCategoryPickerOpen(true)}
                aria-invalid={!!errors.category_id}
                aria-describedby={errors.category_id ? "category-error" : undefined}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                  errors.category_id
                    ? "border-destructive"
                    : categoryLabel
                      ? "border-border bg-card"
                      : "border-border bg-card text-muted-foreground"
                } hover:border-primary/40`}
              >
                <span>{categoryLabel ?? "Velg kategori..."}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>

              {errors.category_id && (
                <p id="category-error" className="text-sm text-destructive">
                  {errors.category_id.message}
                </p>
              )}
            </section>

            {/* Condition as horizontal chip row */}
            <section className="space-y-2">
              <Label>Tilstand</Label>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                {CONDITIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      setValue("condition", c.value as ListingForm["condition"], {
                        shouldValidate: true,
                      })
                    }
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                      condition === c.value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {conditionDescription && (
                <p className="text-xs text-muted-foreground">{conditionDescription}</p>
              )}
            </section>

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

            {/* Similar listings */}
            {similarListings && similarListings.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Lignende annonser</p>
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
              </section>
            )}

            <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-h)] z-40 flex items-center justify-between bg-background/95 px-4 pt-3 pb-3 backdrop-blur border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="size-4" /> Tilbake
              </Button>
              <Button type="button" onClick={() => void goToStep3()}>
                Neste: Beskrivelse <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Native Step 3: Beskrivelse ──────────────────────────────────────── */}
        {native && step === 3 && (
          <div
            className="flex flex-col"
            style={{
              height: "calc(var(--vvh, 100dvh) - var(--app-bottom-nav-h) - 13.75rem)",
            }}
          >
            <section className="flex flex-1 flex-col gap-2 min-h-0">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Beskrivelse</Label>
                <div className="flex items-center gap-1.5">
                  <FieldValid show={!!touchedFields.description && !errors.description} />
                  <span className="text-xs text-muted-foreground">
                    {(description ?? "").length} / 4000
                  </span>
                </div>
              </div>
              <Textarea
                id="description"
                className="flex-1 resize-none min-h-0"
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

            {/* Keyword suggestions */}
            {categoryId &&
              (keywordsFetching || (keywordSuggestions && keywordSuggestions.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {keywordsFetching && (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                  )}
                  {keywordSuggestions?.map(({ word }) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => appendTagToDescription(word)}
                      className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              )}

            <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-h)] z-40 flex items-center justify-between bg-background/95 px-4 pt-3 pb-3 backdrop-blur border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                <ChevronLeft className="size-4" /> Tilbake
              </Button>
              <Button type="button" onClick={() => void goToStep4()}>
                Neste: Sted & levering <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Native Step 4: Sted & levering ──────────────────────────────────── */}
        {native && step === 4 && (
          <div className="space-y-6">
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
              <Label>Sted</Label>
              {locationMethod === null && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void useMyLocation()}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-accent active:scale-95"
                  >
                    <LocateFixed className="size-6 text-primary" />
                    <span className="text-sm font-medium">Bruk min posisjon</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationMethod("postal")}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-accent active:scale-95"
                  >
                    <Hash className="size-6 text-primary" />
                    <span className="text-sm font-medium">Skriv inn postnummer</span>
                  </button>
                </div>
              )}
              {locationMethod === "gps" && (
                <div className="space-y-3">
                  {locationLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Henter posisjon…
                    </div>
                  ) : coords ? (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        <MapPin className="mr-1 inline size-3.5" />
                        {[postalCode, city].filter(Boolean).join(" ") || "Posisjon funnet"}
                      </p>
                      <button
                        type="button"
                        onClick={switchToPostal}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Benytt postnummer isteden
                      </button>
                    </div>
                  ) : null}
                  {coords && (
                    <div className="space-y-2">
                      {native ? (
                        <div
                          className="relative cursor-pointer"
                          onClick={() => setFullscreenMapOpen(true)}
                        >
                          <ListingLocationPicker
                            lat={coords.lat}
                            lng={coords.lng}
                            onChange={() => {}}
                            readOnly
                          />
                          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                            <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
                              Trykk for å justere lokasjonen på annonsen
                            </span>
                          </div>
                        </div>
                      ) : (
                        <ListingLocationPicker
                          lat={coords.lat}
                          lng={coords.lng}
                          onChange={(next) => {
                            markerMoved.current = true;
                            lastEdited.current = "map";
                            setCoords(next);
                          }}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Denne lokasjonen vises på annonsen din. Bare omtrentlig posisjon er synlig
                        for andre.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {locationMethod === "postal" && (
                <div className="space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="w-36 space-y-2">
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
                    {city && <p className="pb-2 text-sm text-muted-foreground">{city}</p>}
                    <button
                      type="button"
                      onClick={switchToGps}
                      className="mb-2 ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Bruk min posisjon isteden
                    </button>
                  </div>
                  {coords && (
                    <div className="space-y-2">
                      {native ? (
                        <div
                          className="relative cursor-pointer"
                          onClick={() => setFullscreenMapOpen(true)}
                        >
                          <ListingLocationPicker
                            lat={coords.lat}
                            lng={coords.lng}
                            onChange={() => {}}
                            readOnly
                          />
                          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                            <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
                              Trykk for å justere lokasjonen på annonsen
                            </span>
                          </div>
                        </div>
                      ) : (
                        <ListingLocationPicker
                          lat={coords.lat}
                          lng={coords.lng}
                          onChange={(next) => {
                            markerMoved.current = true;
                            lastEdited.current = "map";
                            setCoords(next);
                          }}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Denne lokasjonen vises på annonsen din. Bare omtrentlig posisjon er synlig
                        for andre.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-h)] z-40 flex items-center justify-between bg-background/95 px-4 pt-3 pb-3 backdrop-blur border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setStep(3)}>
                <ChevronLeft className="size-4" /> Tilbake
              </Button>
              <Button type="button" onClick={goToStep5}>
                Neste: Forhåndsvisning <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Native Step 5: Forhåndsvisning & publiser ──────────────────────── */}
        {native && step === 5 && (
          <div className="space-y-6">
            <section className="space-y-2">
              <Label>Forhåndsvisning</Label>
              <p className="text-xs text-muted-foreground">
                Dette er slik annonsen din vil se ut i søkelisten
              </p>
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:max-w-[220px]">
                <div className="aspect-square bg-muted">
                  {images[0] ? (
                    <img
                      src={images[0].previewUrl}
                      alt=""
                      className="size-full object-cover"
                      aria-hidden
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs">Ingen bilde</span>
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{title || "—"}</p>
                  {previewPrice && (
                    <p className="font-display text-base font-semibold">{previewPrice}</p>
                  )}
                  {(city || postalCode) && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {city || postalCode}
                    </p>
                  )}
                  {categoryLabel && (
                    <p className="text-xs text-muted-foreground truncate">{categoryLabel}</p>
                  )}
                </div>
              </div>
            </section>

            {uploadProgress && (
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  Laster opp bilde {uploadProgress.done} av {uploadProgress.total}…
                </p>
                <Progress value={(uploadProgress.done / uploadProgress.total) * 100} />
              </div>
            )}

            <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-h)] z-40 flex items-center justify-between bg-background/95 px-4 pt-3 pb-3 backdrop-blur border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setStep(4)}>
                <ChevronLeft className="size-4" /> Tilbake
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCancelDialog(true)}
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
                setStep(2);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Fortsett uten bilde
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
            markerMoved.current = true;
            lastEdited.current = "map";
            setCoords(next);
          }}
          onClose={() => setFullscreenMapOpen(false)}
        />
      )}

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avbryte annonsen?</AlertDialogTitle>
            <AlertDialogDescription>
              Utkastet ditt er lagret og du kan fortsette senere. Vil du forkaste endringene og gå
              til forsiden?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fortsett å redigere</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                navigate({ to: "/" });
              }}
            >
              Forkast og gå til forsiden
            </AlertDialogAction>
          </AlertDialogFooter>
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
