// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDraftImages,
  loadDraftImages,
  saveDraftImages,
  transferDraftImages,
} from "./draft-image-store";

describe("draft image store fallback", () => {
  it("degrades safely when IndexedDB is unavailable", async () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    await expect(saveDraftImages([])).resolves.toBeUndefined();
    await expect(loadDraftImages()).resolves.toEqual([]);
    await expect(clearDraftImages()).resolves.toBeUndefined();
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: original });
  });
});

afterEach(() => vi.unstubAllGlobals());

function imageTransaction(source: unknown) {
  const request = { result: source, onsuccess: null as null | (() => void) };
  const store = { get: vi.fn(() => request), put: vi.fn(), delete: vi.fn() };
  const transaction = {
    objectStore: () => store,
    oncomplete: null as null | (() => void),
    onabort: null as null | (() => void),
    error: null as DOMException | null,
  };
  const db = { transaction: vi.fn(() => transaction), close: vi.fn() };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const openRequest = { result: db, onsuccess: null as null | (() => void) };
      queueMicrotask(() => openRequest.onsuccess?.());
      return openRequest;
    },
  });
  return { request, store, transaction, db };
}

it("bekrefter bildeoverføring først når hele transaksjonen er lagret", async () => {
  const images = [{ id: "guest-image" }];
  const { request, store, transaction } = imageTransaction(images);
  let finished = false;
  const transfer = transferDraftImages("guest", "account").then(() => {
    finished = true;
  });
  await vi.waitFor(() => expect(request.onsuccess).not.toBeNull());
  request.onsuccess!();
  expect(store.put).toHaveBeenCalledWith(images, "account");
  expect(store.delete).toHaveBeenCalledWith("guest");
  await Promise.resolve();
  expect(finished).toBe(false);
  transaction.oncomplete!();
  await transfer;
  expect(finished).toBe(true);
});

it("avviser bildeoverføringen når transaksjonen avbrytes etter skriving", async () => {
  const { request, transaction } = imageTransaction([{ id: "guest-image" }]);
  const transfer = transferDraftImages("guest", "account");
  const rejected = expect(transfer).rejects.toThrow("Quota exceeded");
  await vi.waitFor(() => expect(request.onsuccess).not.toBeNull());
  request.onsuccess!();
  transaction.error = new DOMException("Quota exceeded", "QuotaExceededError");
  transaction.onabort!();
  await rejected;
});

it("beholder kontobildene når en fullført flytting prøves på nytt", async () => {
  const { request, store, transaction } = imageTransaction(undefined);
  const transfer = transferDraftImages("guest", "account");
  await vi.waitFor(() => expect(request.onsuccess).not.toBeNull());
  request.onsuccess!();
  transaction.oncomplete!();
  await transfer;
  expect(store.put).not.toHaveBeenCalled();
  expect(store.delete).not.toHaveBeenCalled();
});

it("avviser gjesteoverføring når IndexedDB ikke er tilgjengelig", async () => {
  vi.stubGlobal("indexedDB", undefined);
  await expect(transferDraftImages("guest", "account")).rejects.toThrow("ikke tilgjengelig");
});
