import { useEffect, useRef, useState } from "react";
import { showSuccessToast } from "@/lib/toast";
import { saveDraftListing } from "@/lib/listings.functions";
import { computeVehicleTitle } from "@/lib/vehicle/vehicle-title";
import type { AttributeMap } from "@/components/attribute-fields";
import type { PendingImage } from "@/components/image-uploader";
import {
  clearDraftImages,
  loadDraftImages,
  saveDraftImages,
} from "@/features/listing-creation/draft-image-store";

const DRAFT_KEY = "kaupet_draft_ny_annonse";
const DRAFT_ID_KEY = "kaupet_draft_id";

type ListingCondition = "new" | "like_new" | "good" | "acceptable" | "for_parts";

type DraftFields = {
  title: string;
  subtitle?: string;
  description?: string;
  selectedParentId: string;
  categoryId: string;
  condition?: ListingCondition | null;
  isFree: boolean;
  canShip?: string | null;
  priceNok: number | string | undefined;
  postalCode?: string;
  city?: string;
  coords: { lat: number; lng: number } | null;
  isVehicle: boolean;
  attributes: AttributeMap;
  images: PendingImage[];
  setImages: (images: PendingImage[]) => void;
  knownIssues?: string;
  noKnownIssues?: boolean;
  maintenanceHistory?: string;
  stepKey: string;
};

type RestoreTarget = {
  // react-hook-form's setValue narrows `field` to a union of known form keys,
  // which is contravariant with a plain `string` param here — accept `any`
  // at this internal boundary rather than fight that when wiring it up.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any) => void;
  setSelectedParentId: (id: string) => void;
  setLocationMethod: (method: "gps" | "postal" | null) => void;
  setAttributes: (attributes: AttributeMap) => void;
  setCoords: (coords: { lat: number; lng: number } | null) => void;
};

/**
 * Owns draft persistence for the new-listing wizard: localStorage autosave
 * (instant, client-only) plus periodic + on-hide Supabase draft saves (so a
 * draft survives across devices/sessions). Pulled out of ny-annonse.tsx,
 * which was mixing this with every other wizard concern in one component.
 */
export function useDraftAutosave(fields: DraftFields) {
  const {
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
    noKnownIssues,
    maintenanceHistory,
    stepKey,
  } = fields;

  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [hasDraftData, setHasDraftData] = useState<Record<string, unknown> | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftSaveInProgress = useRef(false);
  const imageStoreReady = useRef(false);
  const restorableImages = useRef<PendingImage[]>([]);
  const latestImages = useRef(images);

  useEffect(() => {
    latestImages.current = images;
  }, [images]);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const savedId = localStorage.getItem(DRAFT_ID_KEY);
      if (savedId) setDraftId(savedId);
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const data = JSON.parse(saved) as Record<string, unknown>;
      if (
        (data.draft_kind !== undefined && data.draft_kind !== "sell") ||
        (typeof data.draft_version === "number" && data.draft_version > 1)
      ) {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_ID_KEY);
        return;
      }
      const savedAt = typeof data.saved_at === "number" ? data.saved_at : 0;
      if (Date.now() - savedAt < 7 * 24 * 60 * 60 * 1000) {
        if (data.title || data.description || Number(data.image_count) > 0) setHasDraftData(data);
      } else {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_ID_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadDraftImages()
      .then((stored) => {
        if (cancelled) return;
        restorableImages.current = stored;
        imageStoreReady.current = true;
        if (latestImages.current.length > 0) return saveDraftImages(latestImages.current);
      })
      .catch(() => {
        imageStoreReady.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scalar/JSON fields live in localStorage. Binary image drafts are stored
  // separately in IndexedDB below.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            draft_kind: "sell",
            draft_version: 1,
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
            coords,
            attributes,
            known_issues: knownIssues,
            no_known_issues: noKnownIssues,
            maintenance_history: maintenanceHistory,
            image_count: images.length,
            step_key: stepKey,
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
    coords,
    attributes,
    knownIssues,
    noKnownIssues,
    maintenanceHistory,
    images.length,
    stepKey,
  ]);

  useEffect(() => {
    if (!imageStoreReady.current) return;
    const timeout = window.setTimeout(() => {
      void saveDraftImages(images).catch(() => setDraftSaveError(true));
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [images]);

  async function saveDraftToSupabase(): Promise<string | null> {
    if (draftSaveInProgress.current) return draftId;
    // For Bil/MC the title is generated from the vehicle lookup (Årsmodell/
    // Merke/Modell) and is only written into the form's `title` field once
    // the user reaches the description step (see VehicleTitleFields), which
    // comes *after* the image-upload step in the vehicle flow — so without
    // this fallback a vehicle draft could not be saved before that step.
    const effectiveTitle = (isVehicle ? computeVehicleTitle(attributes) : (title ?? "")).trim();
    if (effectiveTitle.length < 5) return null;
    draftSaveInProgress.current = true;
    try {
      const result = await saveDraftListing({
        data: {
          ...(draftId ? { id: draftId } : {}),
          title: effectiveTitle,
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
          known_issues: knownIssues?.trim() || null,
          no_known_issues: !!noKnownIssues,
          maintenance_history: maintenanceHistory?.trim() || null,
          attributes,
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
      return result.id;
    } catch {
      setDraftSaveError(true);
      return null;
    } finally {
      draftSaveInProgress.current = false;
    }
  }

  async function ensureDraftId(): Promise<string | null> {
    if (draftId) return draftId;
    return saveDraftToSupabase();
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

  async function restoreDraft(target: RestoreTarget) {
    if (!hasDraftData) return;
    const { setValue, setSelectedParentId, setLocationMethod, setAttributes, setCoords } = target;
    if (typeof hasDraftData.title === "string") setValue("title", hasDraftData.title);
    if (typeof hasDraftData.subtitle === "string") setValue("subtitle", hasDraftData.subtitle);
    if (typeof hasDraftData.description === "string")
      setValue("description", hasDraftData.description);
    if (typeof hasDraftData.condition === "string") setValue("condition", hasDraftData.condition);
    if (typeof hasDraftData.is_free === "boolean") setValue("is_free", hasDraftData.is_free);
    if (
      hasDraftData.can_ship === "pickup" ||
      hasDraftData.can_ship === "ship" ||
      hasDraftData.can_ship === "both"
    )
      setValue("can_ship", hasDraftData.can_ship);
    if (hasDraftData.price_nok !== undefined) setValue("price_nok", hasDraftData.price_nok);
    if (typeof hasDraftData.postal_code === "string") {
      setValue("postal_code", hasDraftData.postal_code);
      if (hasDraftData.postal_code) setLocationMethod("postal");
    }
    if (typeof hasDraftData.city === "string") setValue("city", hasDraftData.city);
    if (
      hasDraftData.coords &&
      typeof hasDraftData.coords === "object" &&
      typeof (hasDraftData.coords as { lat?: unknown }).lat === "number" &&
      typeof (hasDraftData.coords as { lng?: unknown }).lng === "number"
    ) {
      setCoords(hasDraftData.coords as { lat: number; lng: number });
    }
    if (typeof hasDraftData.selectedParentId === "string")
      setSelectedParentId(hasDraftData.selectedParentId);
    if (typeof hasDraftData.category_id === "string")
      setValue("category_id", hasDraftData.category_id);
    if (hasDraftData.attributes && typeof hasDraftData.attributes === "object")
      setAttributes(hasDraftData.attributes as AttributeMap);
    if (typeof hasDraftData.known_issues === "string")
      setValue("known_issues", hasDraftData.known_issues);
    if (typeof hasDraftData.no_known_issues === "boolean")
      setValue("no_known_issues", hasDraftData.no_known_issues);
    if (typeof hasDraftData.maintenance_history === "string")
      setValue("maintenance_history", hasDraftData.maintenance_history);
    const restoredImages = restorableImages.current.length
      ? restorableImages.current
      : await loadDraftImages().catch(() => []);
    if (restoredImages.length > 0) setImages(restoredImages);
    setHasDraftData(null);
    showSuccessToast(
      restoredImages.length > 0
        ? `Utkast og ${restoredImages.length} bilder gjenopprettet`
        : "Utkast gjenopprettet",
    );
  }

  function clearDraftStorage() {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_ID_KEY);
    void clearDraftImages();
  }

  function discardLocalDraftBanner() {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraftData(null);
    void clearDraftImages();
  }

  return {
    draftId,
    lastSaved,
    draftSaveError,
    hasDraftData,
    saveDraftToSupabase,
    ensureDraftId,
    restoreDraft,
    clearDraftStorage,
    discardLocalDraftBanner,
  };
}
