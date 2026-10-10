import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { showSuccessToast } from "@/lib/toast";
import { discardDraftListing, saveDraftListing } from "@/lib/listings.functions";
import { computeVehicleTitle } from "@/lib/vehicle/vehicle-title";
import type { AttributeMap } from "@/components/attribute-fields";
import type { PendingImage } from "@/components/image-uploader";
import {
  clearDraftImages,
  loadDraftImages,
  saveDraftImages,
} from "@/features/listing-creation/draft-image-store";
import {
  draftStorageKey,
  clearLegacyDrafts,
  isDraftFresh,
  readItem,
  removeItems,
  writeItem,
} from "@/features/listing-creation/draft-storage";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

import { useDraftActor } from "./use-draft-actor";
import { formatErrorMessage } from "@/lib/errors";

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
  organizationLocationId?: string | null;
  coords: { lat: number; lng: number } | null;
  isVehicle: boolean;
  attributes: AttributeMap;
  images: PendingImage[];
  setImages: (images: PendingImage[]) => void;
  knownIssues?: string;
  noKnownIssues?: boolean;
  maintenanceHistory?: string;
  stepKey: string;
  /** False for a signed-out guest: localStorage/IndexedDB still autosave,
   * but every Supabase draft call is skipped (the server functions require
   * auth anyway — see requireSupabaseAuth in listings.functions.ts). */
  authenticated: boolean;
  userId: string | null;
  organizationId: string | null;
  resumeGuest?: boolean;
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
    isVehicle,
    attributes,
    images,
    setImages,
    knownIssues,
    noKnownIssues,
    maintenanceHistory,
    organizationLocationId,
    coords,
    stepKey,
    authenticated,
  } = fields;

  const { ownerId, ownerOrganizationId, actorChanged, isCurrent } = useDraftActor(
    fields.userId,
    fields.organizationId,
  );
  const DRAFT_KEY = draftStorageKey("sell", ownerId, "", ownerOrganizationId);
  const DRAFT_ID_KEY = draftStorageKey("sell", ownerId, "_id", ownerOrganizationId);
  const DRAFT_UPDATED_AT_KEY = draftStorageKey("sell", ownerId, "_updated_at", ownerOrganizationId);
  const [draftSaveMessage, setDraftSaveMessage] = useState<string | null>(null);
  const draftSaveMessageRef = useRef<string | null>(null);
  const guestTransfer = useRef(false);
  const publishPaused = useRef(false);
  const lastServerSnapshot = useRef<string | null>(null);
  const publishedListing = useRef<{ id: string; kaupet_code: string } | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [draftSaveConflict, setDraftSaveConflict] = useState(false);
  const [hasDraftData, setHasDraftData] = useState<Record<string, unknown> | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  // The localStorage read below happens in an effect, so `hasDraftData` is
  // still null during the first commit. Callers that redirect away when there
  // is no draft (ny-annonse.tsx) have to wait for this instead, or they bounce
  // the user off their own saved draft before it has been read.
  const [draftChecked, setDraftChecked] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const draftUpdatedAtRef = useRef<string | null>(null);
  const draftConflictRef = useRef(false);
  const draftRestorePending = useRef(false);
  const restoringDraft = useRef(false);
  // Set by clearDraftStorage({ stopAutosave: true }) on publish: the wizard
  // stays mounted (the success dialog renders on top of it) with the form
  // still populated, so the 30s interval and the visibilitychange handler
  // would otherwise fire another save. With draftIdRef nulled that save is an
  // INSERT, which resurrects the just-published listing as a duplicate draft.
  // One guard here covers all three save paths.
  const draftSavingStopped = useRef(false);
  const draftSaveInProgress = useRef<Promise<string | null> | null>(null);
  const saveDraftToSupabaseRef = useRef<() => Promise<string | null>>(() => Promise.resolve(null));
  const saveGeneration = useRef(0);
  const imageStoreReady = useRef(false);
  const restorableImages = useRef<PendingImage[]>([]);
  const latestImages = useRef(images);
  const latestLocalDraft = useRef<Record<string, unknown> | null>(null);
  const localDraftRevision = useRef(0);
  useEffect(() => {
    draftRestorePending.current = hasDraftData !== null;
  }, [hasDraftData]);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    latestImages.current = images;
  }, [images]);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      clearLegacyDrafts();
      void clearDraftImages("current").catch(() => {});
      if (ownerId && fields.resumeGuest && !readItem(DRAFT_KEY)) {
        const guestKey = draftStorageKey("sell", null);
        const guest = readItem(guestKey);
        // The guest copy never outlives the transfer, so the next guest on this device cannot adopt it.
        if (guest && writeItem(DRAFT_KEY, guest)) {
          removeItems(guestKey);
          guestTransfer.current = true;
        }
      }
      const savedId = readItem(DRAFT_ID_KEY);
      draftUpdatedAtRef.current = readItem(DRAFT_UPDATED_AT_KEY);
      if (savedId) {
        draftIdRef.current = savedId;
        setDraftId(savedId);
      }
      const saved = readItem(DRAFT_KEY);
      if (!saved) return;
      const data = JSON.parse(saved) as Record<string, unknown>;
      if (
        (data.draft_kind !== undefined && data.draft_kind !== "sell") ||
        (typeof data.draft_version === "number" && data.draft_version > 1)
      ) {
        removeItems(DRAFT_KEY, DRAFT_ID_KEY, DRAFT_UPDATED_AT_KEY);
        draftIdRef.current = null;
        setDraftId(null);
        return;
      }
      const savedAt = typeof data.saved_at === "number" ? data.saved_at : 0;
      if (isDraftFresh(savedAt)) {
        if (data.title || data.description || Number(data.image_count) > 0) setHasDraftData(data);
      } else {
        removeItems(DRAFT_KEY, DRAFT_ID_KEY, DRAFT_UPDATED_AT_KEY);
        draftIdRef.current = null;
        setDraftId(null);
      }
    } catch {
      // ignore
    } finally {
      setDraftChecked(true);
    }
  }, [DRAFT_ID_KEY, DRAFT_KEY, DRAFT_UPDATED_AT_KEY, fields.resumeGuest, ownerId]);

  useEffect(() => {
    let cancelled = false;
    const loadImages = async () => {
      if (!guestTransfer.current) return loadDraftImages(DRAFT_KEY);
      // The transferred draft is the guest's, so its images replace any leftovers on the account key.
      const guestKey = draftStorageKey("sell", null);
      const guestImages = await loadDraftImages(guestKey);
      if (guestImages.length) await saveDraftImages(guestImages, DRAFT_KEY);
      await clearDraftImages(guestKey);
      return guestImages.length ? guestImages : loadDraftImages(DRAFT_KEY);
    };
    void loadImages()
      .then((stored) => {
        if (cancelled) return;
        restorableImages.current = stored;
        imageStoreReady.current = true;
        if (latestImages.current.length > 0)
          return saveDraftImages(latestImages.current, DRAFT_KEY);
      })
      .catch(() => {
        imageStoreReady.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [DRAFT_KEY]);

  // Scalar/JSON fields live in localStorage. Binary image drafts are stored
  // separately in IndexedDB below.
  const buildLocalDraft = useCallback(
    () => ({
      draft_kind: "sell" as const,
      draft_version: 1 as const,
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
      organization_location_id: organizationLocationId,
      coords,
      attributes,
      known_issues: knownIssues,
      no_known_issues: noKnownIssues,
      maintenance_history: maintenanceHistory,
      image_count: images.length,
      step_key: stepKey,
      saved_at: Date.now(),
    }),
    [
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
      organizationLocationId,
      coords,
      attributes,
      knownIssues,
      noKnownIssues,
      maintenanceHistory,
      images.length,
      stepKey,
    ],
  );

  useIsomorphicLayoutEffect(() => {
    latestLocalDraft.current = buildLocalDraft();
    localDraftRevision.current += 1;
  }, [buildLocalDraft]);

  useEffect(() => {
    if (draftRestorePending.current) return;
    const t = window.setTimeout(() => {
      if (draftSavingStopped.current || !isCurrent()) return;
      if (writeItem(DRAFT_KEY, JSON.stringify(buildLocalDraft()))) setLastSaved(new Date());
    }, 2000);
    return () => window.clearTimeout(t);
  }, [buildLocalDraft, hasDraftData, DRAFT_KEY, isCurrent]);

  useEffect(() => {
    if (!imageStoreReady.current) return;
    const timeout = window.setTimeout(() => {
      if (!isCurrent() || draftSavingStopped.current) return;
      void saveDraftImages(images, DRAFT_KEY).catch(() => setDraftSaveError(true));
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [images, DRAFT_KEY, isCurrent]);

  /** Writes the draft locally *now* — no debounce, no server call. Used when
   * a signed-out guest is sent to /auth to publish: the draft has to survive
   * the redirect, and the server would reject an unauthenticated save. */
  async function flushLocalDraft(): Promise<boolean> {
    if (!isCurrent()) return false;
    if (writeItem(DRAFT_KEY, JSON.stringify(buildLocalDraft()))) {
      setLastSaved(new Date());
    } else {
      setDraftSaveError(true);
      return false;
    }
    try {
      await saveDraftImages(latestImages.current, DRAFT_KEY);
      setDraftSaveError(false);
      return true;
    } catch {
      setDraftSaveError(true);
      return false;
    }
  }
  async function saveDraftToSupabase({ force = false } = {}): Promise<string | null> {
    if (!authenticated || !ownerId || !isCurrent() || publishPaused.current) return null;
    if (draftSavingStopped.current) return null;
    if (draftConflictRef.current) return null;
    if (draftRestorePending.current) return null;
    draftSaveMessageRef.current = null;
    const saveRevision = localDraftRevision.current;
    if (writeItem(DRAFT_KEY, JSON.stringify(buildLocalDraft()))) {
      setLastSaved(new Date());
    } else {
      setDraftSaveError(true);
      return null;
    }
    const currentDraftId = draftIdRef.current;
    if (draftSaveInProgress.current) return draftSaveInProgress.current;
    // For Bil/MC the title is generated from the vehicle lookup (Årsmodell/
    // Merke/Modell) and is only written into the form's `title` field once
    // the user reaches the description step (see VehicleTitleFields), which
    // comes *after* the image-upload step in the vehicle flow — so without
    // this fallback a vehicle draft could not be saved before that step.
    const effectiveTitle = (isVehicle ? computeVehicleTitle(attributes) : (title ?? "")).trim();
    if (effectiveTitle.length < 5) return null;
    const snapshot = JSON.stringify({ ...buildLocalDraft(), saved_at: 0 });
    if (!force && currentDraftId && snapshot === lastServerSnapshot.current) return currentDraftId;
    publishedListing.current = null;
    const generation = saveGeneration.current;
    const save = (async () => {
      try {
        const result = await saveDraftListing({
          data: {
            expected_user_id: ownerId,
            expected_organization_id: ownerOrganizationId,
            ...(currentDraftId ? { id: currentDraftId } : {}),
            ...(currentDraftId && draftUpdatedAtRef.current
              ? { expected_updated_at: draftUpdatedAtRef.current }
              : {}),
            title: effectiveTitle,
            subtitle: (subtitle ?? "").trim() || null,
            // Always send the value, never `undefined`: saveDraftListing strips
            // undefined keys from the update payload, so an emptied description
            // would keep whatever the row held before — which leaked the
            // previous listing's text into the next one when the draft row is
            // reused. Empty string rather than null: the column is NOT NULL.
            description: (description ?? "").trim(),
            category_id: categoryId || null,
            condition: condition || null,
            is_free: isFree,
            price_nok: isFree ? null : typeof priceNok === "number" ? priceNok : null,
            postal_code: postalCode || null,
            city: city || null,
            organization_location_id: organizationLocationId || null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            can_ship: canShip == null ? null : canShip !== "pickup",
            known_issues: knownIssues?.trim() || null,
            no_known_issues: !!noKnownIssues,
            maintenance_history: maintenanceHistory?.trim() || null,
            attributes,
          },
        });
        if (saveGeneration.current !== generation || !isCurrent()) return null;
        if ("conflict" in result) {
          draftConflictRef.current = true;
          draftUpdatedAtRef.current = result.updated_at;
          writeItem(DRAFT_UPDATED_AT_KEY, result.updated_at);
          setDraftSaveError(true);
          setDraftSaveConflict(true);
          return null;
        }
        setDraftSaveMessage(null);
        draftIdRef.current = result.id;
        if (result.updated_at) {
          draftUpdatedAtRef.current = result.updated_at;
        }
        setDraftId(result.id);
        draftConflictRef.current = false;
        if ("published" in result && result.published) {
          // A lost publish response: the listing is live, so these edits were not saved.
          publishedListing.current = { id: result.id, kaupet_code: result.kaupet_code };
          draftSaveMessageRef.current =
            "Annonsen er allerede publisert. Endringer her lagres ikke – rediger den publiserte annonsen.";
          setDraftSaveMessage(draftSaveMessageRef.current);
          setDraftSaveError(true);
          return null;
        }
        lastServerSnapshot.current = snapshot;
        setLastSaved(new Date());
        setDraftSaveError(false);
        setDraftSaveConflict(false);
        if (writeItem(DRAFT_ID_KEY, result.id) && result.updated_at) {
          writeItem(DRAFT_UPDATED_AT_KEY, result.updated_at);
        }
        return result.id;
      } catch (error) {
        if (saveGeneration.current === generation && isCurrent()) {
          draftSaveMessageRef.current = formatErrorMessage(
            error,
            "Utkastet kunne ikke lagres. Innholdet er beholdt lokalt. Prøv igjen senere.",
          );
          setDraftSaveMessage(draftSaveMessageRef.current);
          setDraftSaveError(true);
          setDraftSaveConflict(false);
        }
        return null;
      } finally {
        if (
          isCurrent() &&
          !draftSavingStopped.current &&
          localDraftRevision.current > saveRevision &&
          latestLocalDraft.current
        ) {
          writeItem(DRAFT_KEY, JSON.stringify(latestLocalDraft.current));
        }
        draftSaveInProgress.current = null;
      }
    })();
    draftSaveInProgress.current = save;
    return save;
  }

  async function ensureDraftId(): Promise<string | null> {
    if (draftIdRef.current) return draftIdRef.current;
    return saveDraftToSupabase();
  }

  useIsomorphicLayoutEffect(() => {
    saveDraftToSupabaseRef.current = saveDraftToSupabase;
  });

  async function retryDraftAfterConflict(): Promise<string | null> {
    if (draftSaveInProgress.current) await draftSaveInProgress.current;
    draftConflictRef.current = false;
    setDraftSaveConflict(false);
    return saveDraftToSupabase();
  }

  // Auto-save draft to Supabase every 30 seconds when form has enough data
  useEffect(() => {
    const interval = window.setInterval(() => {
      void saveDraftToSupabaseRef.current();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [
    title,
    description,
    categoryId,
    condition,
    isFree,
    priceNok,
    postalCode,
    city,
    organizationLocationId,
    draftId,
  ]);

  // Flush the newest form snapshot straight into localStorage, synchronously
  // and unconditionally except for the two real guards below. Reads
  // everything through refs (latestLocalDraft/draftRestorePending, updated
  // synchronously by the layout effect above and by restoreDraft/
  // clearDraftStorage) instead of closing over `hasDraftData` state, so this
  // can be wired up once on mount and still always see the latest answer —
  // no stale closure, no need to tear the listeners down and rebuild them
  // every time a draft is detected or restored.
  //
  // `draftRestorePending.current` alone is the "don't overwrite the
  // not-yet-restored draft on disk with blank form state" guard (added in
  // 7138667, see the "overskriver ikke et lokalt utkast..." test below): it
  // is true for exactly as long as an unrestored draft is being offered to
  // the user. Checking `hasDraftData !== null` in addition to it was a wider
  // version of the same condition that read component state instead of the
  // ref — since `restoreDraft`/`clearDraftStorage` flip the ref synchronously
  // but `setHasDraftData` only takes effect on the next render, a hide/
  // pagehide firing in that gap would see the ref already cleared but the
  // stale `hasDraftData` state still non-null, and wrongly stay blocked.
  const flushLocalDraftSync = useCallback(() => {
    if (!isCurrent() || draftSavingStopped.current || draftRestorePending.current) return;
    if (!latestLocalDraft.current) return;
    if (writeItem(DRAFT_KEY, JSON.stringify(latestLocalDraft.current))) {
      setLastSaved(new Date());
    } else {
      setDraftSaveError(true);
    }
  }, [DRAFT_KEY, isCurrent]);

  // Save draft when the tab is hidden (switch away, close, or reload) and on
  // pagehide — the reliable unload signal on mobile/iOS Safari, where
  // visibilitychange can fire too late or not at all. Both matter: a change
  // made just before the tab disappears must not wait for the 2s debounce
  // above.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) flushLocalDraftSync();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushLocalDraftSync);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushLocalDraftSync);
    };
  }, [flushLocalDraftSync]);

  async function restoreDraft(target: RestoreTarget) {
    if (!isCurrent() || !hasDraftData) return;
    restoringDraft.current = true;
    const { setValue, setSelectedParentId, setLocationMethod, setAttributes, setCoords } = target;
    if (typeof hasDraftData.title === "string") setValue("title", hasDraftData.title);
    if (typeof hasDraftData.subtitle === "string") setValue("subtitle", hasDraftData.subtitle);
    if (typeof hasDraftData.description === "string")
      setValue("description", hasDraftData.description);
    if (typeof hasDraftData.condition === "string") setValue("condition", hasDraftData.condition);
    if (typeof hasDraftData.is_free === "boolean") setValue("is_free", hasDraftData.is_free);
    // "both" is a legacy draft value from when this was a three-way choice
    // it never survived: the column is a boolean, so "both" and "ship" always
    // persisted identically. Normalise rather than drop, so old drafts keep a
    // delivery method instead of coming back blank.
    if (hasDraftData.can_ship === "pickup") setValue("can_ship", "pickup");
    else if (hasDraftData.can_ship === "ship" || hasDraftData.can_ship === "both")
      setValue("can_ship", "ship");
    if (hasDraftData.price_nok !== undefined) setValue("price_nok", hasDraftData.price_nok);
    if (typeof hasDraftData.postal_code === "string") {
      setValue("postal_code", hasDraftData.postal_code);
      if (hasDraftData.postal_code) setLocationMethod("postal");
    }
    if (typeof hasDraftData.organization_location_id === "string")
      setValue("organization_location_id", hasDraftData.organization_location_id);
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
      : await loadDraftImages(DRAFT_KEY).catch(() => []);
    if (!isCurrent()) return;
    if (restoredImages.length > 0) setImages(restoredImages);
    restoringDraft.current = false;
    draftRestorePending.current = false;
    setHasDraftData(null);
    showSuccessToast(
      restoredImages.length > 0
        ? `Utkast og ${restoredImages.length} bilder gjenopprettet`
        : "Utkast gjenopprettet",
    );
  }

  /** `stopAutosave` when the wizard is done with this draft for good (publish).
   * Left false for "start over" flows, where the same mounted wizard keeps
   * autosaving a fresh draft right afterwards. */
  function clearDraftStorage({ stopAutosave = false }: { stopAutosave?: boolean } = {}) {
    if (!isCurrent()) return;
    publishPaused.current = false;
    lastServerSnapshot.current = null;
    publishedListing.current = null;
    draftSavingStopped.current = stopAutosave;
    saveGeneration.current += 1;
    latestLocalDraft.current = null;
    localDraftRevision.current += 1;
    removeItems(DRAFT_KEY, DRAFT_ID_KEY, DRAFT_UPDATED_AT_KEY);
    draftUpdatedAtRef.current = null;
    draftConflictRef.current = false;
    setDraftSaveConflict(false);
    draftRestorePending.current = false;
    draftIdRef.current = null;
    setHasDraftData(null);
    setDraftId(null);
    void clearDraftImages(DRAFT_KEY);
  }

  /** Stops offering the recoverable draft without discarding or restoring
   * it — the on-disk/server row is left untouched — but detaches the
   * wizard's own draftId from it, so any autosave that runs from here on
   * writes a *new* draft instead of silently overwriting the declined one
   * with whatever the user types next (see "ikke overskriver..." tests). */
  function dismissDraftOffer() {
    // Restoring fields can make the form dirty before IndexedDB has finished.
    if (restoringDraft.current) return;
    draftRestorePending.current = false;
    draftConflictRef.current = false;
    draftIdRef.current = null;
    draftUpdatedAtRef.current = null;
    setDraftSaveConflict(false);
    setDraftId(null);
    setHasDraftData(null);
    removeItems(DRAFT_ID_KEY, DRAFT_UPDATED_AT_KEY);
  }

  async function discardDraft() {
    if (!isCurrent()) return;
    const id = draftIdRef.current ?? readItem(DRAFT_ID_KEY);
    clearDraftStorage();
    if (!authenticated || !id) return;
    try {
      await discardDraftListing({ data: { id } });
      setDraftSaveError(false);
    } catch {
      // Local cleanup is intentional even when the server is unavailable.
      setDraftSaveError(true);
    }
  }

  async function preparePublish() {
    if (!isCurrent()) throw new Error("Kontoen er endret. Logg inn med opprinnelig konto.");
    // Finish the existing write before pausing; never publish with a stale render's draftId.
    if (draftSaveInProgress.current) await draftSaveInProgress.current;
    const id = await saveDraftToSupabase({ force: true });
    if (!isCurrent()) throw new Error("Kontoen er endret. Logg inn med opprinnelig konto.");
    if (publishedListing.current) {
      publishPaused.current = true;
      return { ...publishedListing.current, published: true as const };
    }
    if (!id)
      throw new Error(
        draftSaveMessageRef.current ?? "Utkastet må lagres før publisering. Prøv igjen.",
      );
    publishPaused.current = true;
    return { id, published: false as const };
  }

  return {
    actorChanged,
    ownerId,
    ownerOrganizationId,
    isCurrent,
    preparePublish,
    resumeAutosave: () => {
      publishPaused.current = false;
    },
    draftSaveMessage,
    draftId,
    draftChecked,
    lastSaved,
    draftSaveError,
    draftSaveConflict,
    hasDraftData,
    flushLocalDraft,
    saveDraftToSupabase,
    retryDraftAfterConflict,
    ensureDraftId,
    restoreDraft,
    clearDraftStorage,
    discardDraft,
    dismissDraftOffer,
  };
}
