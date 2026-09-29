import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

import { invalidateNotificationQueries, notificationHistoryQueryKey } from "./notifications";

describe("varselinvalidering", () => {
  it("bruker samme historikknøkkel ved lasting og pull-to-refresh", () => {
    expect(notificationHistoryQueryKey("user-1", 60)).toEqual([
      ...notificationHistoryQueryKey("user-1"),
      60,
    ]);
  });

  it("oppdaterer historikk, bjelle, badge og lagrede søk etter en handling", () => {
    const invalidateQueries = vi.fn();
    invalidateNotificationQueries({ invalidateQueries } as unknown as QueryClient);

    expect(invalidateQueries.mock.calls.map(([query]) => query.queryKey)).toEqual([
      ["notifications"],
      ["notifications-unread-count"],
      ["saved-search-unread-counts"],
    ]);
  });
});
