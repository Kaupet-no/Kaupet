import { useEffect, useRef, useState } from "react";
import { showSuccessToast } from "@/lib/toast";
import { saveDraftListing } from "@/lib/listings.functions";
import { computeVehicleTitle } from "@/lib/vehicle/vehicle-title";
import type { AttributeMap } from "@/components/attribute-fields";

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
};

type RestoreTarget = {
  // react-hook-form's setValue narrows `field` to a union of known form keys,
  // which is contravariant with a plain `string` param here — accept `any`
  // at this internal boundary rather than fight that when wiring it up.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any) => void;
  setSelectedParentId: (id: string) => void;
  setLocationMethod: (method: "gps" | "postal" | null) => void;
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
  } = fields;

  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [hasDraftData, setHasDraftData] = useState<Record<string, unknown> | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftSaveInProgress = useRef(false);

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

  async function saveDraftToSupabase(): Promise<string | null> {
    if (draftSaveInProgress.current) return draftId;
    // For Bil/MC the title is generated from the vehicle lookup (Årsmodell/
    // Merke/Modell) and is only written into the form's `title` field once
    // the user reaches the description step (see VehicleTitleFields), which
    // comes *after* the image-upload step in the vehicle flow — so without
    // this fallback a draft could never be saved before that step (e.g. from
    // the 360°-capture QR panel).
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

  function restoreDraft(target: RestoreTarget) {
    if (!hasDraftData) return;
    const { setValue, setSelectedParentId, setLocationMethod } = target;
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
    if (typeof hasDraftData.selectedParentId === "string")
      setSelectedParentId(hasDraftData.selectedParentId);
    if (typeof hasDraftData.category_id === "string")
      setValue("category_id", hasDraftData.category_id);
    setHasDraftData(null);
    showSuccessToast("Utkast gjenopprettet!");
  }

  function clearDraftStorage() {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_ID_KEY);
  }

  function discardLocalDraftBanner() {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraftData(null);
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
