import { useEffect, useRef, useState } from "react";

import { discardWtbDraft, getLatestWtbDraft, saveWtbDraft } from "@/lib/wtb-listings.functions";
import type { WtbAttributeMap } from "./wtb-criteria-types";

const DRAFT_KEY = "kaupet_draft_want_listing";
const DRAFT_ID_KEY = "kaupet_draft_want_listing_id";
const DRAFT_VERSION = 1;

export type WtbDraftData = {
  draft_kind: "want";
  draft_version: 1;
  saved_at: number;
  title: string;
  description: string;
  category_id: string | null;
  max_price_nok: number | "" | undefined;
  attributes: WtbAttributeMap;
  checked_keys: string[];
};

function loadRestorableDraft(): WtbDraftData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as WtbDraftData;
    const valid =
      data.draft_kind === "want" &&
      data.draft_version === DRAFT_VERSION &&
      Date.now() - data.saved_at < 7 * 24 * 60 * 60 * 1000;
    return valid && (data.title || data.description || data.category_id) ? data : null;
  } catch {
    return null;
  }
}

export function useWtbDraftAutosave(
  fields: Omit<WtbDraftData, "draft_kind" | "draft_version" | "saved_at">,
) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [restorableDraft, setRestorableDraft] = useState<WtbDraftData | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveInProgress = useRef<Promise<string | null> | null>(null);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const local = loadRestorableDraft();
      setDraftId(localStorage.getItem(DRAFT_ID_KEY));
      setRestorableDraft(local);
      void getLatestWtbDraft()
        .then((server) => {
          if (!server) return;
          const savedAt = new Date(server.updated_at).getTime();
          setDraftId(server.id);
          localStorage.setItem(DRAFT_ID_KEY, server.id);
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
            attributes,
            checked_keys: Object.keys(attributes).filter((key) => key !== "__freetext"),
          });
        })
        .catch(() => {
          // Offline or migration pending: keep the local copy.
        });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function saveLocal() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          draft_kind: "want",
          draft_version: DRAFT_VERSION,
          saved_at: Date.now(),
          ...fieldsRef.current,
        } satisfies WtbDraftData),
      );
      setLastSaved(new Date());
      setDraftSaveError(false);
    } catch {
      setDraftSaveError(true);
    }
  }

  useEffect(() => {
    if (restorableDraft) return;
    const timeout = window.setTimeout(saveLocal, 2_000);
    return () => window.clearTimeout(timeout);
  }, [fields, restorableDraft]);

  async function saveToServer(): Promise<string | null> {
    saveLocal();
    // An autosave and a publish-triggered save can land on the same tick;
    // share the in-flight promise instead of one of them bailing out with a
    // stale draftId, which would otherwise leave the concurrent save's
    // draft row orphaned (see saveWtbDraft/createWtbListing).
    if (saveInProgress.current) return saveInProgress.current;
    const currentFields = fieldsRef.current;
    if (currentFields.title.trim().length < 3) return draftId;
    setIsSaving(true);
    const promise = (async () => {
      try {
        const result = await saveWtbDraft({
          data: {
            ...(draftId ? { id: draftId } : {}),
            title: currentFields.title,
            description: currentFields.description || undefined,
            category_id: currentFields.category_id,
            max_price_nok:
              typeof currentFields.max_price_nok === "number" ? currentFields.max_price_nok : null,
            attributes: currentFields.attributes,
          },
        });
        setDraftId(result.id);
        localStorage.setItem(DRAFT_ID_KEY, result.id);
        setLastSaved(new Date());
        setDraftSaveError(false);
        return result.id;
      } catch {
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
  }, [draftId]);

  function clearStorage() {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_ID_KEY);
  }

  return {
    draftId,
    restorableDraft,
    lastSaved,
    draftSaveError,
    isSaving,
    saveToServer,
    dismissRestore: () => setRestorableDraft(null),
    discardDraft: async () => {
      const id = draftId;
      clearStorage();
      setRestorableDraft(null);
      setDraftId(null);
      if (id) {
        try {
          await discardWtbDraft({ data: { id } });
        } catch {
          setDraftSaveError(true);
        }
      }
    },
    clearAfterPublish: () => {
      clearStorage();
      setRestorableDraft(null);
      setDraftId(null);
    },
  };
}
