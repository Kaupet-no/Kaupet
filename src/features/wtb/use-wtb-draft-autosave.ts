import { useCallback, useEffect, useRef, useState } from "react";

import { discardWtbDraft, getLatestWtbDraft, saveWtbDraft } from "@/lib/wtb-listings.functions";
import {
  clearLegacyDrafts,
  draftStorageKey,
  draftStorageScope,
  isDraftFresh,
  readItem,
  removeItems,
  writeItem,
} from "@/features/listing-creation/draft-storage";
import type { WtbAttributeMap } from "./wtb-criteria-types";

import { useDraftActor } from "@/features/listing-creation/use-draft-actor";
import { formatErrorMessage } from "@/lib/errors";
const DRAFT_VERSION = 1;

export type WtbDraftData = {
  draft_kind: "want";
  draft_version: 1;
  saved_at: number;
  title: string;
  description: string;
  category_id: string | null;
  max_price_nok: number | string | undefined;
  notify_matches: boolean;
  attributes: WtbAttributeMap;
  checked_keys: string[];
  /** Valgfritt område. Mangler i utkast lagret før feltet fantes. */
  postal_code?: string;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
};

function loadRestorableDraft(DRAFT_KEY: string): WtbDraftData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as WtbDraftData;
    const valid =
      data.draft_kind === "want" &&
      data.draft_version === DRAFT_VERSION &&
      isDraftFresh(data.saved_at);
    return valid && (data.title || data.description || data.category_id)
      ? { ...data, notify_matches: data.notify_matches ?? false }
      : null;
  } catch {
    return null;
  }
}

export function useWtbDraftAutosave(
  fields: Omit<WtbDraftData, "draft_kind" | "draft_version" | "saved_at">,
  authenticated: boolean,
  userId: string | null,
  resumeGuest = false,
) {
  const { ownerId, actorChanged, isCurrent } = useDraftActor(userId);
  const [storageScope] = useState(() => draftStorageScope("want", ownerId, null, resumeGuest));
  const DRAFT_KEY = draftStorageKey("want", ownerId) + storageScope;
  const DRAFT_ID_KEY = draftStorageKey("want", ownerId, "_id") + storageScope;
  const [draftSaveMessage, setDraftSaveMessage] = useState<string | null>(null);
  const publishPaused = useRef(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const lastServerSnapshot = useRef<string | null>(null);
  const rememberDraftId = useCallback((id: string | null) => {
    draftIdRef.current = id;
    setDraftId(id);
    if (!id) lastServerSnapshot.current = null;
  }, []);
  const [restorableDraft, setRestorableDraft] = useState<WtbDraftData | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveInProgress = useRef<Promise<string | null> | null>(null);
  const savingStopped = useRef(false);
  const restorableDraftRef = useRef<WtbDraftData | null>(null);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  useEffect(() => {
    restorableDraftRef.current = restorableDraft;
  }, [restorableDraft]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!isCurrent()) return;
      clearLegacyDrafts();
      if (ownerId && resumeGuest && !readItem(DRAFT_KEY)) {
        const guestKey = draftStorageKey("want", null);
        const guest = readItem(guestKey);
        if (guest && writeItem(DRAFT_KEY, guest)) removeItems(guestKey);
      }
      const local = loadRestorableDraft(DRAFT_KEY);
      rememberDraftId(readItem(DRAFT_ID_KEY));
      setRestorableDraft(local);
      if (!authenticated || storageScope) return;
      void getLatestWtbDraft()
        .then((server) => {
          if (!server || !isCurrent()) return;
          const savedAt = new Date(server.updated_at).getTime();
          rememberDraftId(server.id);
          writeItem(DRAFT_ID_KEY, server.id);
          if (local && local.saved_at >= savedAt) return;
          const attributes = (server.attributes ?? {}) as WtbAttributeMap;
          setRestorableDraft({
            draft_kind: "want",
            draft_version: DRAFT_VERSION,
            saved_at: savedAt,
            title: server.title,
            description: server.description ?? "",
            category_id: server.category_id,
            max_price_nok: server.max_price_nok ?? "",
            notify_matches: server.notify_matches ?? false,
            attributes,
            checked_keys: Object.keys(attributes).filter((key) => key !== "__freetext"),
            postal_code: server.postal_code ?? "",
            city: server.city,
            lat: server.lat,
            lng: server.lng,
            radius_km: server.radius_km,
          });
        })
        .catch(() => {
          // Offline or migration pending: keep the local copy.
        });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [
    authenticated,
    DRAFT_ID_KEY,
    DRAFT_KEY,
    isCurrent,
    ownerId,
    resumeGuest,
    rememberDraftId,
    storageScope,
  ]);

  /** Returns false when the browser refused the write (private mode, quota) —
   * the guest publish handoff must not navigate away on a lost draft. */
  const saveLocal = useCallback((): boolean => {
    if (!isCurrent()) return false;
    if (savingStopped.current) return true;
    const ok = writeItem(
      DRAFT_KEY,
      JSON.stringify({
        draft_kind: "want",
        draft_version: DRAFT_VERSION,
        saved_at: Date.now(),
        ...fieldsRef.current,
      } satisfies WtbDraftData),
    );
    if (ok) setLastSaved(new Date());
    setDraftSaveError(!ok);
    return ok;
  }, [DRAFT_KEY, isCurrent]);

  useEffect(() => {
    if (restorableDraft) return;
    const timeout = window.setTimeout(saveLocal, 2_000);
    return () => window.clearTimeout(timeout);
  }, [fields, restorableDraft, saveLocal]);

  // Flush the newest fields straight into localStorage, synchronously and
  // unconditionally except for the two guards below — mirrors
  // flushLocalDraftSync in listing-creation/use-draft-autosave.ts (F2). Reads
  // through fieldsRef, which saveLocal already uses, so there is no stale
  // closure to worry about from wiring this up once on mount.
  //
  // Gate on `restorableDraftRef.current`, not the `restorableDraft` state:
  // dismissRestore/discardDraft/the draft-load effect flip the ref via a
  // plain effect one render after the state setter, so a hide/pagehide
  // firing in that one-render gap would see a stale non-null `restorableDraft`
  // and wrongly stay blocked. The ref is exactly "an unrestored draft is
  // currently being offered to the user" — same role `draftRestorePending`
  // plays on the sell side.
  const flushLocalDraftSync = useCallback(() => {
    if (savingStopped.current || restorableDraftRef.current) return;
    saveLocal();
  }, [saveLocal]);

  // Save locally when the tab is hidden (switch away, close, or reload) and
  // on pagehide — the reliable unload signal on mobile/iOS Safari, where
  // visibilitychange can fire too late or not at all. Both matter: an edit
  // made just before the tab disappears must not wait for the 2s debounce
  // above. This is in addition to the saveToServer() call below, not a
  // replacement for it.
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

  async function saveToServer(): Promise<string | null> {
    if (!isCurrent() || publishPaused.current) return null;
    if (savingStopped.current) return draftIdRef.current;
    if (restorableDraftRef.current) return draftIdRef.current;
    saveLocal();
    if (!authenticated || !ownerId) return draftIdRef.current;
    // share the in-flight promise instead of one of them bailing out with a
    // stale draftId, which would otherwise leave the concurrent save's
    // draft row orphaned (see saveWtbDraft/createWtbListing).
    if (saveInProgress.current) return saveInProgress.current;
    const currentFields = fieldsRef.current;
    if (currentFields.title.trim().length < 3) return draftIdRef.current;
    const snapshot = JSON.stringify(currentFields);
    if (draftIdRef.current && lastServerSnapshot.current === snapshot) return draftIdRef.current;
    const rawMaxPrice = currentFields.max_price_nok;
    const parsedMaxPrice =
      typeof rawMaxPrice === "number"
        ? rawMaxPrice
        : typeof rawMaxPrice === "string" && rawMaxPrice.trim()
          ? Number(rawMaxPrice)
          : null;
    const maxPriceNok =
      parsedMaxPrice !== null &&
      Number.isInteger(parsedMaxPrice) &&
      parsedMaxPrice >= 0 &&
      parsedMaxPrice <= 10_000_000
        ? parsedMaxPrice
        : null;
    setIsSaving(true);
    const promise = (async () => {
      try {
        const result = await saveWtbDraft({
          data: {
            expected_user_id: ownerId,
            ...(draftIdRef.current ? { id: draftIdRef.current } : {}),
            title: currentFields.title,
            description: currentFields.description || undefined,
            category_id: currentFields.category_id,
            max_price_nok: maxPriceNok,
            notify_matches: currentFields.notify_matches,
            attributes: currentFields.attributes,
            // Et halvskrevet postnummer ville fått serveren til å avvise hele utkastet.
            postal_code: /^\d{4}$/.test(currentFields.postal_code ?? "")
              ? currentFields.postal_code
              : null,
            city: currentFields.city ?? null,
            lat: currentFields.lat ?? null,
            lng: currentFields.lng ?? null,
            radius_km: currentFields.radius_km ?? null,
          },
        });
        if (!isCurrent()) return null;
        setDraftSaveMessage(null);
        rememberDraftId(result.id);
        lastServerSnapshot.current = snapshot;
        writeItem(DRAFT_ID_KEY, result.id);
        setLastSaved(new Date());
        setDraftSaveError(false);
        return result.id;
      } catch (error) {
        if (!isCurrent()) return null;
        setDraftSaveMessage(
          formatErrorMessage(
            error,
            "Utkastet kunne ikke lagres. Innholdet er beholdt lokalt. Prøv igjen senere.",
          ),
        );
        setDraftSaveError(true);
        return null;
      } finally {
        saveInProgress.current = null;
        setIsSaving(false);
      }
    })();
    saveInProgress.current = promise;
    return promise;
  }

  useEffect(() => {
    const interval = window.setInterval(() => void saveToServer(), 30_000);
    const onVisibility = () => {
      if (document.hidden) void saveToServer();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // Interval/listener identity must stay stable across field edits —
    // saveToServer always reads the latest fields via fieldsRef, so it
    // doesn't belong in this effect's deps (see fieldsRef above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, authenticated]);

  function clearStorage() {
    removeItems(DRAFT_KEY, DRAFT_ID_KEY);
  }

  async function preparePublish() {
    // Publishing the current form declines an unanswered restore offer; otherwise saveToServer skips the save.
    if (restorableDraftRef.current) {
      restorableDraftRef.current = null;
      setRestorableDraft(null);
    }
    if (saveInProgress.current) await saveInProgress.current;
    const id = await saveToServer();
    if (!id || !isCurrent()) throw new Error("Utkastet må lagres før publisering. Prøv igjen.");
    publishPaused.current = true;
    return id;
  }

  return {
    actorChanged,
    ownerId,
    isCurrent,
    draftSaveMessage,
    preparePublish,
    resumeAutosave: () => {
      publishPaused.current = false;
    },
    draftId,
    restorableDraft,
    lastSaved,
    draftSaveError,
    flushLocalDraft: saveLocal,
    isSaving,
    saveToServer,
    dismissRestore: () => setRestorableDraft(null),
    discardDraft: async () => {
      if (!isCurrent()) return;
      const id = draftIdRef.current;
      clearStorage();
      setRestorableDraft(null);
      rememberDraftId(null);
      if (!id || !authenticated) return;
      try {
        await discardWtbDraft({ data: { id } });
      } catch {
        setDraftSaveError(true);
      }
    },
    clearAfterPublish: () => {
      if (!isCurrent()) return;
      savingStopped.current = true;
      clearStorage();
      setRestorableDraft(null);
      rememberDraftId(null);
    },
  };
}
