// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_TTL_MS,
  draftStorageKey,
  draftStorageScope,
  isDraftFresh,
  readItem,
  removeItems,
  writeItem,
} from "@/features/listing-creation/draft-storage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("draft-storage", () => {
  it("skriver, leser og fjerner", () => {
    expect(writeItem("a", "1")).toBe(true);
    expect(readItem("a")).toBe("1");
    writeItem("b", "2");
    removeItems("a", "b");
    expect(readItem("a")).toBeNull();
    expect(readItem("b")).toBeNull();
  });

  it("utløper etter 7 dager", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DRAFT_TTL_MS + 1000);
    expect(isDraftFresh(1001)).toBe(true);
    expect(isDraftFresh(1000)).toBe(false);
    expect(isDraftFresh(0)).toBe(false);
  });

  it("kaster ikke når localStorage kaster", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(readItem("a")).toBeNull();
    expect(writeItem("a", "1")).toBe(false);
    expect(() => removeItems("a", "b")).not.toThrow();
  });
});

describe("gjesteoverføringens lagringsområde", () => {
  it("velger eget område for hver gjesteoverføring uten å endre eksisterende utkast", () => {
    const key = draftStorageKey("sell", "user-1", "", "org-1");
    const guestKey = draftStorageKey("sell", null);
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify({ saved_at: now + 1000 }));
    localStorage.setItem(`${key}:handoff:${now - 1}`, JSON.stringify({ saved_at: now + 2000 }));
    localStorage.setItem(guestKey, JSON.stringify({ saved_at: now }));
    expect(draftStorageScope("sell", "user-1", "org-1", true)).toBe(`:handoff:${now}`);
    expect(localStorage.length).toBe(3);
    expect(draftStorageScope("sell", null, null, true)).toBe("");
  });

  it("gjenopptar nyeste overføring kun for samme konto, bedrift og innholdstype", () => {
    const key = draftStorageKey("sell", "user-1", "", "org-1");
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify({ saved_at: now - 10 }));
    localStorage.setItem(`${key}:handoff:old`, JSON.stringify({ saved_at: now - 5 }));
    localStorage.setItem(`${key}:handoff:new`, JSON.stringify({ saved_at: now }));
    expect(draftStorageScope("sell", "user-1", "org-1", false)).toBe(":handoff:new");
    expect(draftStorageScope("sell", "user-2", "org-1", false)).toBe("");
    expect(draftStorageScope("sell", "user-1", "org-2", false)).toBe("");
    expect(draftStorageScope("want", "user-1", "org-1", false)).toBe("");
    localStorage.removeItem(`${key}:handoff:new`);
    expect(draftStorageScope("sell", "user-1", "org-1", false)).toBe(":handoff:old");
    localStorage.setItem(key, JSON.stringify({ saved_at: now }));
    expect(draftStorageScope("sell", "user-1", "org-1", false)).toBe("");
  });

  it.each([
    "",
    "broken",
    "null",
    "[]",
    "{}",
    '{"saved_at":"123"}',
    '{"saved_at":0}',
    '{"saved_at":-1}',
  ])("ignorerer ugyldig gjestedata %s", (value) => {
    localStorage.setItem(draftStorageKey("sell", null), value);
    expect(draftStorageScope("sell", "user-1", null, true)).toBe("");
  });

  it("avviser utløpt overføring på 7-dagersgrensen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DRAFT_TTL_MS + 1000);
    const key = draftStorageKey("sell", "user-1");
    localStorage.setItem(`${key}:handoff:1000`, JSON.stringify({ saved_at: 1000 }));
    expect(draftStorageScope("sell", "user-1", null, false)).toBe("");
    localStorage.setItem(`${key}:handoff:1000`, JSON.stringify({ saved_at: 1001 }));
    expect(draftStorageScope("sell", "user-1", null, false)).toBe(":handoff:1000");
  });

  it("kaster ikke når opplisting av lagringsnøkler er blokkert", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new Error("blocked");
    });
    localStorage.setItem("other", "value");
    expect(draftStorageScope("sell", "user-1", null, false)).toBe("");
  });
});
