import { useEffect, useRef, useState } from "react";
import { showErrorToast } from "@/lib/toast";
import { describeImageError, signListingImageUrls, validateImages } from "@/lib/storage";
import { compressImage } from "@/lib/image-compression";

export type EditorItem =
  | { kind: "existing"; key: string; storage_path: string; url?: string; caption?: string }
  | {
      kind: "new";
      key: string;
      file: File;
      thumbFile: File;
      previewUrl: string;
      caption?: string;
    };

type EditableListing = {
  id: string;
  listing_images: {
    id: string;
    storage_path: string;
    sort_order: number;
    caption?: string | null;
  }[];
};

/**
 * Owns the image list for the listing-edit page: hydrating existing images
 * from the listing (with signed URLs), adding/removing/reordering, and
 * tracking whether the image set has changed from what was loaded (for the
 * unsaved-changes guard). Pulled out of mine-annonser.$id.rediger.tsx, same
 * pattern as the hooks already extracted from ny-annonse.tsx.
 */
export function useEditableListingImages(listing: EditableListing | undefined) {
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
      caption: img.caption ?? undefined,
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

  const addFiles = async (files: File[]) => {
    const err = validateImages(files);
    if (err) {
      showErrorToast(describeImageError(err));
      return;
    }
    const [compressed, thumbs] = await Promise.all([
      Promise.all(files.map((file) => compressImage(file, "listing"))),
      Promise.all(files.map((file) => compressImage(file, "listing-thumb"))),
    ]);
    const next: EditorItem[] = compressed.map((file, i) => ({
      kind: "new",
      key: crypto.randomUUID(),
      file,
      thumbFile: thumbs[i],
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((curr) => [...curr, ...next]);
  };

  const setCaption = (key: string, caption: string) => {
    setItems((curr) => curr.map((it) => (it.key === key ? { ...it, caption } : it)));
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

  const imagesDirty =
    originalImageKeysRef.current !== null &&
    items.map((i) => i.key).join("|") !== originalImageKeysRef.current;

  return {
    items,
    removedPaths,
    fileInputRef,
    addFiles,
    removeItem,
    move,
    setCaption,
    imagesDirty,
  };
}
