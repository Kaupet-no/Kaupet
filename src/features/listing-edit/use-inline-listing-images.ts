import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import {
  describeImageError,
  LISTING_BUCKET,
  uploadListingImage,
  validateImages,
} from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

export type InlineImageItem = {
  id: string | null;
  storage_path: string;
  sort_order: number;
  caption: string | null;
  uploading?: boolean;
};

type ListingImageRow = {
  id: string;
  storage_path: string;
  sort_order: number;
  caption: string | null;
};

/**
 * Autosave variant of `useEditableListingImages` — each action (add/remove/
 * reorder/caption) writes immediately instead of collecting a batch for one
 * big save, mirroring `EditableField`'s per-action autosave for inline
 * listing editing.
 */
export function useInlineListingImages(params: {
  listingId: string;
  images: { storage_path: string; sort_order: number; caption?: string | null }[];
  imgUrls: Record<string, string>;
}) {
  const { listingId, images, imgUrls } = params;
  const queryClient = useQueryClient();
  const [items, setItems] = useState<InlineImageItem[]>(() =>
    images
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => ({
        id: null,
        storage_path: img.storage_path,
        sort_order: img.sort_order,
        caption: img.caption ?? null,
      })),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Re-sync from the query whenever the source list changes (e.g. after
  // invalidation from another field's save), unless a local mutation is
  // still in flight for images specifically — simplest safe approach given
  // uploads/removals are already optimistic below.
  useEffect(() => {
    setItems(
      images
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((img) => ({
          id: null,
          storage_path: img.storage_path,
          sort_order: img.sort_order,
          caption: img.caption ?? null,
        })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.map((i) => i.storage_path).join("|")]);

  function invalidate() {
    // Prefix match — invalidates every ["listing", ...] query (the detail
    // view is keyed by kaupet_code, which this hook doesn't have on hand).
    queryClient.invalidateQueries({ queryKey: ["listing"] });
  }

  async function persistOrder(nextItems: InlineImageItem[]) {
    const rows = nextItems.map((it, idx) => ({ storage_path: it.storage_path, sort_order: idx }));
    // upsert on storage_path via delete+insert of sort_order per row.
    for (const row of rows) {
      const { error } = await supabase
        .from("listing_images")
        .update({ sort_order: row.sort_order })
        .eq("listing_id", listingId)
        .eq("storage_path", row.storage_path);
      if (error) throw error;
    }
  }

  async function addFiles(files: File[]) {
    const err = validateImages(files);
    if (err) {
      showErrorToast(describeImageError(err));
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      showErrorToast("Du må være logget inn.");
      return;
    }
    for (const file of files) {
      const tempPath = `pending-${crypto.randomUUID()}`;
      setItems((curr) => [
        ...curr,
        {
          id: null,
          storage_path: tempPath,
          sort_order: curr.length,
          caption: null,
          uploading: true,
        },
      ]);
      try {
        const path = await uploadListingImage({
          userId,
          listingId,
          index: Date.now(),
          file,
        });
        const sortOrder = items.length;
        const { error } = await supabase.from("listing_images").insert({
          listing_id: listingId,
          storage_path: path,
          sort_order: sortOrder,
          caption: null,
        });
        if (error) throw error;
        setItems((curr) =>
          curr.map((it) =>
            it.storage_path === tempPath ? { ...it, storage_path: path, uploading: false } : it,
          ),
        );
        invalidate();
      } catch (e) {
        showErrorToast(formatErrorMessage(e, "Kunne ikke laste opp bildet"));
        setItems((curr) => curr.filter((it) => it.storage_path !== tempPath));
      }
    }
  }

  async function removeItem(storagePath: string) {
    const prev = items;
    setItems((curr) => curr.filter((it) => it.storage_path !== storagePath));
    try {
      const { error } = await supabase
        .from("listing_images")
        .delete()
        .eq("listing_id", listingId)
        .eq("storage_path", storagePath);
      if (error) throw error;
      // Best-effort storage cleanup.
      await supabase.storage.from(LISTING_BUCKET).remove([storagePath]);
      invalidate();
    } catch (e) {
      setItems(prev);
      showErrorToast(formatErrorMessage(e, "Kunne ikke fjerne bildet"));
    }
  }

  async function move(storagePath: string, dir: -1 | 1) {
    const prev = items;
    const idx = items.findIndex((i) => i.storage_path === storagePath);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const next = [...items];
    const [it] = next.splice(idx, 1);
    next.splice(newIdx, 0, it);
    setItems(next);
    try {
      await persistOrder(next);
      invalidate();
    } catch (e) {
      setItems(prev);
      showErrorToast(formatErrorMessage(e, "Kunne ikke endre rekkefølge"));
    }
  }

  function setCaption(storagePath: string, caption: string) {
    setItems((curr) =>
      curr.map((it) => (it.storage_path === storagePath ? { ...it, caption } : it)),
    );
    if (captionTimers.current[storagePath]) clearTimeout(captionTimers.current[storagePath]);
    captionTimers.current[storagePath] = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("listing_images")
          .update({ caption: caption.trim() || null })
          .eq("listing_id", listingId)
          .eq("storage_path", storagePath);
        if (error) throw error;
        invalidate();
      } catch (e) {
        showErrorToast(formatErrorMessage(e, "Kunne ikke lagre bildetekst"));
      }
    }, 700);
  }

  return { items, imgUrls, fileInputRef, addFiles, removeItem, move, setCaption };
}

export type { ListingImageRow };
