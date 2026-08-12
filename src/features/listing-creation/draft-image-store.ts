import type { PendingImage } from "@/components/image-uploader";

const DB_NAME = "kaupet-listing-drafts";
const STORE_NAME = "images";
const DRAFT_KEY = "current";

type StoredImage = {
  id: string;
  file: File;
  thumbFile: File;
  caption?: string;
  sortOrder: number;
};

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = execute(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveDraftImages(images: PendingImage[]): Promise<void> {
  const stored: StoredImage[] = images.map((image, sortOrder) => ({
    id: image.id,
    file: image.file,
    thumbFile: image.thumbFile,
    caption: image.caption,
    sortOrder,
  }));
  await runTransaction("readwrite", (store) => store.put(stored, DRAFT_KEY));
}

export async function loadDraftImages(): Promise<PendingImage[]> {
  const stored = await runTransaction<StoredImage[]>("readonly", (store) => store.get(DRAFT_KEY));
  return (stored ?? [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => ({
      id: image.id,
      file: image.file,
      thumbFile: image.thumbFile,
      caption: image.caption,
      previewUrl: URL.createObjectURL(image.file),
    }));
}

export async function clearDraftImages(): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(DRAFT_KEY));
}
