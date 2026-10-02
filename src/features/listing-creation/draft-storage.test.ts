// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_TTL_MS,
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
