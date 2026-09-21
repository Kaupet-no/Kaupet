import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

import {
  invalidateSharedCategoryQueries,
  invalidateSharedVehicleQueries,
} from "./reference-query-invalidation";

function fakeClient() {
  const invalidateQueries = vi.fn();
  return { qc: { invalidateQueries } as unknown as QueryClient, invalidateQueries };
}

const keysFrom = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey);

describe("shared reference invalidation", () => {
  // Guards the bug these helpers exist for: admin mutations used to refresh
  // only their own ["admin", …] keys, leaving the app-wide caches stale.
  it("covers every shared category cache", () => {
    const { qc, invalidateQueries } = fakeClient();
    invalidateSharedCategoryQueries(qc);
    expect(keysFrom(invalidateQueries)).toEqual([
      ["categories"],
      ["category-filters"],
      ["category-flows"],
    ]);
  });

  it("covers every shared vehicle reference cache", () => {
    const { qc, invalidateQueries } = fakeClient();
    invalidateSharedVehicleQueries(qc);
    expect(keysFrom(invalidateQueries)).toEqual([
      ["vehicle-brands", "all"],
      ["vehicle-models", "all"],
      ["vehicle-model-classes", "all"],
    ]);
  });
});
