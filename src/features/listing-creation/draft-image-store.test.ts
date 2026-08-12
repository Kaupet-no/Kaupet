// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clearDraftImages, loadDraftImages, saveDraftImages } from "./draft-image-store";

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
