import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { NativePageHeader } from "@/components/native-page-header";
import { useIsNative } from "@/hooks/use-is-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Loader2, ImagePlus, X, ChevronLeft, ChevronRight, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { republishListing } from "@/lib/listings.functions";
import {
  geocodeNorwayAddress,
  lookupPostalCode,
  lookupCity,
  reverseGeocodeAddress,
} from "@/lib/geocode";
import { FullscreenLocationPicker } from "@/components/fullscreen-location-picker";
import {
  LISTING_BUCKET,
  MAX_IMAGES,
  describeImageError,
  signListingImageUrls,
  uploadListingImage,
  validateImages,
} from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAllCategoryFilters, type AttributeMap } from "@/components/attribute-fields";
import {
  categoryBreadcrumb,
  getMissingRequiredFilters,
  vehicleCategoryGroupFor,
  type CategoryNode,
} from "@/lib/category-filters";
import { CategoryPicker } from "@/components/category-picker";
import { modulesForKeys } from "@/features/listing-creation/modules/registry";
import { effectiveFlowForCategory } from "@/features/listing-creation/category-flows";
import { useAllCategoryFlows } from "@/features/listing-creation/use-all-category-flows";
import {
  fieldGroupsForKeys,
  FIELD_GROUP_LABELS_NB,
} from "@/features/listing-creation/field-groups/registry";
import { validateRequiredFieldGroups } from "@/features/listing-creation/field-groups/validators";
import { VehicleTitleFields } from "@/features/listing-creation/field-groups/title-photos";
import type { WizardSharedProps } from "@/features/listing-creation/field-groups/types";
import { CONDITIONS } from "@/lib/constants";
import { suggestKeywordsForListing } from "@/lib/keyword-suggestion.functions";
import { matchWtbListingsForListing } from "@/lib/wtb-listings.functions";
import { getCurrentPosition, requestLocationPermission, isNative } from "@/lib/native";

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

const schema = z.object({
  title: z.string().trim().min(5).max(120),
  subtitle: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().min(20).max(4000),
  category_id: z.string().uuid(),
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
type FormValues = z.infer<typeof schema>;

type EditorItem =
  | { kind: "existing"; key: string; storage_path: string; url?: string }
  | { kind: "new"; key: string; file: File; previewUrl: string };

/**
 * Groups the edit form into numbered sections mirroring the create-wizard's
 * step order/labels, so editing an existing listing feels structurally
 * consistent with creating one even though it's a single scrolling page
 * rather than a paginated wizard.
 */
function EditSection({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={step === 1 ? "space-y-6" : "space-y-6 border-t border-border pt-8"}>
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {step}
        </span>
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/mine-annonser/$id/rediger")({
  head: () => ({
    meta: [{ title: "Rediger annonse — Kaupet.no" }],
  }),
  component: EditListingPage,
});

function EditListingPage() {
  const native = useIsNative();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, parent_id, icon, color")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing-edit", id],
    queryFn: async () => {
      const [{ data, error }, { data: loc, error: locError }] = await Promise.all([
        supabase
          .from("listings")
          .select(
            "id, title, subtitle, description, category_id, condition, is_free, price_nok, can_ship, postal_code, city, status, attributes, listing_images(id, storage_path, sort_order)",
          )
          .eq("id", id)
          .single(),
        supabase.rpc("get_listing_owner_location", { _listing_id: id }).maybeSingle(),
      ]);
      if (error) throw error;
      if (locError) throw locError;
      return { ...data, lat: loc?.lat ?? null, lng: loc?.lng ?? null };
    },
  });

  const formValues = useMemo<FormValues | undefined>(() => {
    if (!listing) return undefined;
    return {
      title: listing.title,
      subtitle: listing.subtitle ?? "",
      description: listing.description ?? "",
      category_id: listing.category_id ?? "",
      condition: (listing.condition as FormValues["condition"]) ?? null,
      is_free: listing.is_free,
      can_ship: listing.can_ship === true ? "ship" : listing.can_ship === false ? "pickup" : null,
      price_nok: listing.price_nok ?? "",
      postal_code: listing.postal_code ?? "",
      city: listing.city ?? "",
    };
  }, [listing]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, touchedFields, isDirty },
  } = useForm<FormValues>({
    values: formValues,
    defaultValues: {
      title: "",
      subtitle: "",
      description: "",
      category_id: "",
      condition: null,
      is_free: false,
      can_ship: null,
      price_nok: "",
      postal_code: "",
      city: "",
    },
  });

  const isFree = watch("is_free");
  const priceNok = watch("price_nok");
  const categoryId = watch("category_id");
  const condition = watch("condition");
  const canShip = watch("can_ship");
  const postalCode = watch("postal_code");
  const city = watch("city");
  const title = watch("title");
  const subtitle = watch("subtitle");
  const description = watch("description");

  const [showPublishWarning, setShowPublishWarning] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastEditedRef = useRef<"postal_code" | "city" | "map" | null>(null);
  const markerMovedRef = useRef(false);
  const coordsHydratedFor = useRef<string | null>(null);
  const [locationMethod, setLocationMethod] = useState<"gps" | "postal" | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [fullscreenMapOpen, setFullscreenMapOpen] = useState(false);
  const locationMethodHydratedFor = useRef<string | null>(null);

  // Initialize coords from existing listing
  useEffect(() => {
    if (!listing || coordsHydratedFor.current === listing.id) return;
    coordsHydratedFor.current = listing.id;
    if (typeof listing.lat === "number" && typeof listing.lng === "number") {
      setCoords({ lat: listing.lat, lng: listing.lng });
    }
  }, [listing]);

  // Default the location method to "postal" for existing listings that already
  // have a postal code/city, so editing doesn't hide the already-filled-in
  // location fields behind the create-wizard's pick-a-method screen.
  useEffect(() => {
    if (!listing || locationMethodHydratedFor.current === listing.id) return;
    locationMethodHydratedFor.current = listing.id;
    if (listing.postal_code || listing.city) setLocationMethod("postal");
  }, [listing]);

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

  // Auto-fill postal from city
  useEffect(() => {
    if (lastEditedRef.current !== "city") return;
    const c = (city ?? "").trim();
    if (c.length < 2) return;
    const t = window.setTimeout(async () => {
      const r = await lookupCity(c);
      if (!r) return;
      if (r.postal_code && !(postalCode ?? "").trim()) {
        setValue("postal_code", r.postal_code, { shouldValidate: false });
      }
      if (!markerMovedRef.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, setValue]);

  // Reverse-geocode map position back to city/postal
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

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const categoryHydratedFor = useRef<string | null>(null);
  const [attributes, setAttributes] = useState<AttributeMap>({});
  const [attributesTouched, setAttributesTouched] = useState(false);

  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string }>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);
  const missingFilters = useMemo(
    () =>
      getMissingRequiredFilters(categoryId || null, allFilters ?? [], categoriesById, attributes),
    [categoryId, allFilters, categoriesById, attributes],
  );
  const categoryLabel = categoryId ? categoryBreadcrumb(categoryId, categoriesById) || null : null;
  const vehicleGroup = useMemo(
    () => vehicleCategoryGroupFor(categoryId || null, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );

  // Initialize attributes from existing listing when it loads (once)
  useEffect(() => {
    if (!listing || !categories) return;
    if (categoryHydratedFor.current === listing.id) return;
    if (listing.attributes && typeof listing.attributes === "object") {
      setAttributes(listing.attributes as AttributeMap);
    }
    categoryHydratedFor.current = listing.id;
  }, [listing, categories]);

  const { data: allFlows } = useAllCategoryFlows();
  const fieldGroupKeys = useMemo(
    () => effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById).fieldGroups,
    [categoryId, allFlows, categoriesById],
  );
  const activeModules = useMemo(
    () =>
      modulesForKeys(
        effectiveFlowForCategory(categoryId || null, allFlows ?? [], categoriesById).modules,
      ),
    [categoryId, allFlows, categoriesById],
  );
  const fieldGroups = useMemo(
    () =>
      // vehicle-registration/vehicle-confirm never re-trigger on edit: the
      // listing already has a leaf category_id, so there's nothing to look
      // up or confirm — editing goes straight to the normal field groups.
      fieldGroupsForKeys(fieldGroupKeys).filter(
        (g) =>
          g.key !== "category-select" &&
          g.key !== "title-photos" &&
          g.key !== "review-publish" &&
          g.key !== "vehicle-registration" &&
          g.key !== "vehicle-confirm",
      ),
    [fieldGroupKeys],
  );
  const conditionDescription = CONDITIONS.find((c) => c.value === condition)?.description;

  // Category suggestions don't make sense when editing an already-published
  // listing (suggesting a different category off a title tweak mid-edit
  // would be surprising) — deliberately stubbed out so CategoryAttributes'
  // suggestion banner never shows here.
  const categorySuggestion = null;
  const categoryTouchedManually = true;
  function applyCategorySuggestion() {}
  function setSuggestionDismissed() {}
  function setCategorySuggestion() {}

  // Debounced title for WTB/keyword/similar-listings queries
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
        .neq("id", id)
        .textSearch("search_vector", significantWords.join(" "), {
          config: "norwegian",
          type: "plain",
        })
        .limit(3);
      return data ?? [];
    },
  });

  const matchWtbFn = useServerFn(matchWtbListingsForListing);
  const { data: wtbMatch } = useQuery({
    queryKey: ["wtb-match", categoryId ?? null, debouncedTitle],
    enabled: debouncedTitle.length >= 3,
    staleTime: 120_000,
    queryFn: () => matchWtbFn({ data: { title: debouncedTitle, category_id: categoryId || null } }),
  });

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

  // Image editor state
  const [items, setItems] = useState<EditorItem[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedFor = useRef<string | null>(null);
  const originalImageKeysRef = useRef<string | null>(null);

  useEffect(() => {
    if (!listing || hydratedFor.current === listing.id) return;
    const sorted = [...(listing.listing_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const initial: EditorItem[] = sorted.map((img) => ({
      kind: "existing",
      key: img.storage_path,
      storage_path: img.storage_path,
    }));
    setItems(initial);
    hydratedFor.current = listing.id;
    originalImageKeysRef.current = initial.map((i) => i.key).join("|");
    if (sorted.length > 0) {
      signListingImageUrls(sorted.map((i) => i.storage_path)).then((map) => {
        setItems((curr) =>
          curr.map((it) => (it.kind === "existing" ? { ...it, url: map[it.storage_path] } : it)),
        );
      });
    }
  }, [listing]);

  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.kind === "new") URL.revokeObjectURL(it.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: File[]) => {
    const err = validateImages(files, items.length);
    if (err) {
      showErrorToast(describeImageError(err));
      return;
    }
    const next: EditorItem[] = files.map((file) => ({
      kind: "new",
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((curr) => [...curr, ...next]);
  };

  const removeItem = (key: string) => {
    setItems((curr) => {
      const target = curr.find((i) => i.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.previewUrl);
      if (target?.kind === "existing") {
        setRemovedPaths((paths) => [...paths, target.storage_path]);
      }
      return curr.filter((i) => i.key !== key);
    });
  };

  const move = (key: string, dir: -1 | 1) => {
    setItems((curr) => {
      const idx = curr.findIndex((i) => i.key === key);
      if (idx < 0) return curr;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= curr.length) return curr;
      const copy = [...curr];
      const [it] = copy.splice(idx, 1);
      copy.splice(newIdx, 0, it);
      return copy;
    });
  };

  // Unsaved-changes guard: form dirty, image list changed, or attributes touched.
  const imagesDirty =
    originalImageKeysRef.current !== null &&
    items.map((i) => i.key).join("|") !== originalImageKeysRef.current;
  const skipGuardRef = useRef(false);
  const hasUnsavedChanges = (isDirty || imagesDirty || attributesTouched) && !skipGuardRef.current;
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    withResolver: true,
    enableBeforeUnload: hasUnsavedChanges,
  });

  const doRepublish = useServerFn(republishListing);
  const publishDraft = useMutation({
    mutationFn: () => doRepublish({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      showSuccessToast("Annonsen er publisert!");
      skipGuardRef.current = true;
      navigate({ to: "/mine-annonser" });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke publisere annonsen")),
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);
      const finalCoords =
        coords ??
        (await geocodeNorwayAddress({
          postal_code: parsed.postal_code,
          city: parsed.city,
        }));

      const { error: updErr } = await supabase
        .from("listings")
        .update({
          title: parsed.title,
          subtitle: parsed.subtitle || null,
          description: parsed.description,
          category_id: parsed.category_id,
          condition: fieldGroupKeys.includes("condition") ? (parsed.condition ?? null) : null,
          is_free: parsed.is_free,
          can_ship: fieldGroupKeys.includes("delivery-location")
            ? parsed.can_ship !== "pickup"
            : null,
          price_nok: parsed.is_free
            ? null
            : typeof parsed.price_nok === "number"
              ? parsed.price_nok
              : null,
          postal_code: parsed.postal_code || null,
          city: parsed.city || null,
          lat: finalCoords?.lat ?? null,
          lng: finalCoords?.lng ?? null,
          attributes,
        })
        .eq("id", id);
      if (updErr) throw updErr;

      // Images: upload new files, then replace listing_images rows.
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Du må være logget inn.");

      const uploadedPaths: Record<string, string> = {};
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "new") {
          const path = await uploadListingImage({
            userId,
            listingId: id,
            index: i,
            file: it.file,
          });
          uploadedPaths[it.key] = path;
        }
      }

      // Wipe and re-insert listing_images in new order.
      const { error: delErr } = await supabase.from("listing_images").delete().eq("listing_id", id);
      if (delErr) throw delErr;

      const rows = items.map((it, idx) => ({
        listing_id: id,
        storage_path: it.kind === "existing" ? it.storage_path : uploadedPaths[it.key],
        sort_order: idx,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("listing_images").insert(rows);
        if (insErr) throw insErr;
      }

      // Best-effort: delete removed files from storage.
      if (removedPaths.length > 0) {
        await supabase.storage.from(LISTING_BUCKET).remove(removedPaths);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing-edit", id] });
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      showSuccessToast("Endringer lagret");
      skipGuardRef.current = true;
      navigate({ to: "/mine-annonser" });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre endringene")),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <NativePageHeader title="Rediger annonse" backTo="/mine-annonser" />
      {!native && (
        <>
          <h1 className="font-display text-3xl tracking-tight">Rediger annonse</h1>
          <p className="mt-1 text-muted-foreground">
            Oppdater detaljer og bilder. Endringene lagres når du trykker «Lagre endringer».
          </p>
        </>
      )}

      {listing?.status === "draft" && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="flex-1 text-amber-800 dark:text-amber-300">
            Dette er et utkast — annonsen er ikke publisert og bare du kan se den.
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const missingPrice = !isFree && (priceNok === "" || priceNok === undefined);
              const missingImages = items.length === 0;
              if (missingPrice || missingImages) {
                setShowPublishWarning(true);
              } else {
                publishDraft.mutate();
              }
            }}
            disabled={publishDraft.isPending}
          >
            {publishDraft.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Publiser annonsen
          </Button>
        </div>
      )}

      <AlertDialog open={showPublishWarning} onOpenChange={setShowPublishWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annonsen mangler informasjon</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Følgende felter er ikke utfylt:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {items.length === 0 && <li>Ingen bilder lagt til</li>}
                  {!isFree && (priceNok === "" || priceNok === undefined) && (
                    <li>Ingen pris satt</li>
                  )}
                </ul>
                <p className="mt-3">Vil du publisere likevel, eller gå tilbake og fylle inn?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Gå tilbake</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowPublishWarning(false);
                publishDraft.mutate();
              }}
            >
              Publiser likevel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <form
        onSubmit={handleSubmit((v) => {
          if (missingFilters.length > 0) {
            setAttributesTouched(true);
            showErrorToast("Fyll inn alle obligatoriske egenskaper før du lagrer.");
            return;
          }
          for (const mod of activeModules) {
            const err = mod.validateExtra?.(attributes);
            if (err) {
              showErrorToast(err);
              return;
            }
          }
          const fieldGroupError = validateRequiredFieldGroups(fieldGroupKeys, {
            condition: v.condition ?? null,
            can_ship: fieldGroupKeys.includes("delivery-location")
              ? v.can_ship != null
                ? v.can_ship !== "pickup"
                : null
              : null,
          });
          if (fieldGroupError) {
            showErrorToast(fieldGroupError);
            return;
          }
          mutation.mutate(v);
        })}
        className="mt-8 space-y-8"
      >
        <EditSection step={1} title={FIELD_GROUP_LABELS_NB["title-photos"]}>
          <section className="space-y-3">
            <Label>Bilder</Label>
            <p className="text-xs text-muted-foreground">
              {items.length} av {MAX_IMAGES} bilder. Første bilde er hovedbildet. Bruk pilene for å
              endre rekkefølge.
            </p>

            {items.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {items.map((it, idx) => {
                  const src = it.kind === "existing" ? it.url : it.previewUrl;
                  return (
                    <li
                      key={it.key}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={
                            idx === 0 ? "Hovedbilde av annonsen" : `Bilde ${idx + 1} av annonsen`
                          }
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {idx === 0 && (
                        <span className="absolute left-2 top-2 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
                          Hoved
                        </span>
                      )}
                      {it.kind === "new" && (
                        <span className="absolute right-2 top-2 rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-foreground">
                          Ny
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
                        <div className="flex">
                          <button
                            type="button"
                            onClick={() => move(it.key, -1)}
                            className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                            disabled={idx === 0}
                            aria-label="Flytt venstre"
                          >
                            <ChevronLeft className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(it.key, 1)}
                            className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                            disabled={idx === items.length - 1}
                            aria-label="Flytt høyre"
                          >
                            <ChevronRight className="size-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(it.key)}
                          className="rounded p-1 text-white hover:bg-destructive"
                          aria-label="Fjern bilde"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fl = e.target.files;
                  if (fl) addFiles(Array.from(fl));
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={items.length >= MAX_IMAGES}
              >
                <ImagePlus className="size-4" />
                Last opp bilder
              </Button>
            </div>
          </section>

          {vehicleGroup ? (
            <VehicleTitleFields
              register={register}
              setValue={setValue}
              errors={errors}
              touchedFields={touchedFields}
              title={title}
              subtitle={subtitle}
              attributes={attributes}
            />
          ) : (
            <section className="space-y-2">
              <Label htmlFor="title">Tittel</Label>
              <Input id="title" {...register("title")} />
              {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
            </section>
          )}
        </EditSection>

        {(() => {
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
            onCategorySelect: (id) => setValue("category_id", id, { shouldValidate: true }),
            categorySuggestion,
            categoryTouchedManually,
            applyCategorySuggestion,
            setSuggestionDismissed,
            setCategorySuggestion,

            attributes,
            onAttributesChange: setAttributes,
            attributesTouched,
            activeModules,

            // Vehicle-first lookup/confirm never re-trigger on edit (see
            // `fieldGroups` filter above) — these are unused no-ops here.
            bilOgMcCategoryId: null,
            vehicleRegistered: true,
            setVehicleRegistered: () => {},
            vehicleLookupLoading: false,
            vehicleLookupError: null,
            vehicleLookupResult: null,
            vehicleClassification: null,
            vehiclePreviousClassificationMismatch: null,
            runVehicleLookup: () => {},
            matchVehicleBrandForLeaf: async () => null,
            confirmVehicleData: () => {},
            rejectVehicleLookup: () => {},

            conditionDescription,

            wtbMatch,

            keywordsFetching,
            keywordSuggestions,
            appendTagToDescription,

            similarListings,

            images: [],
            setImages: () => {},
            uploadProgress: null,

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

            previewPrice: null,
            mutationIsPending: mutation.isPending,
            turnstileEnabled: false,
            turnstileToken: null,
            setTurnstileToken: () => {},
            onCancel: () => navigate({ to: "/mine-annonser" }),
          };
          return (
            <>
              {fieldGroups.map((g, idx) => (
                <EditSection
                  key={g.key}
                  step={idx + 2}
                  title={FIELD_GROUP_LABELS_NB[g.key] ?? g.key}
                >
                  <g.Component {...sharedProps} />
                </EditSection>
              ))}
            </>
          );
        })()}

        <CategoryPicker
          open={categoryPickerOpen}
          onOpenChange={setCategoryPickerOpen}
          categories={categories ?? []}
          selectedId={categoryId || ""}
          onSelect={(id) => setValue("category_id", id, { shouldValidate: true })}
        />

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

        <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/mine-annonser" })}
            disabled={mutation.isPending}
          >
            Avbryt
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Lagre endringer
          </Button>
        </div>
      </form>

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Du har ulagrede endringer</AlertDialogTitle>
            <AlertDialogDescription>
              Hvis du forlater siden nå, mister du endringene du har gjort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => blocker.proceed?.()}
            >
              Forkast endringer
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Fortsett å redigere
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
