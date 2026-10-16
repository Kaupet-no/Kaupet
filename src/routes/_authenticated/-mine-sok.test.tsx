// @vitest-environment jsdom
import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: () => null,
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-push-status", () => ({
  usePushStatus: () => ({ loading: true, supported: false, savedSearchesActive: false }),
}));
vi.mock("@/hooks/use-categories", () => ({
  useCategories: () => ({ data: [] }),
  visibleCategories: () => [],
}));
vi.mock("@/hooks/use-user-roles", () => ({ useIsDemo: () => ({ data: false }) }));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));
vi.mock("@/components/push-enable-prompt", () => ({ PushEnablePrompt: () => null }));
vi.mock("@/features/listing-search/filters/advanced-search-sheet", () => ({
  AdvancedSearchSheet: () => null,
}));
vi.mock("@/features/listing-search/filters/native-advanced-search", () => ({
  NativeAdvancedSearch: () => null,
}));
vi.mock("@/lib/saved-searches", () => ({
  listSavedSearches: async () => [
    {
      id: "s1",
      user_id: "u1",
      name: "Sykkel i nærheten",
      notify: false,
      created_at: "2026-10-01T00:00:00Z",
      criteria: {
        terms: ["sykkel"],
        lat: 59.9,
        lng: 10.7,
        radius: 10,
        extraGroups: [{ id: "x", mode: "any", exclude: true, terms: ["ødelagt"] }],
      },
    },
  ],
  listUnreadCountsBySearch: async () => new Map(),
  summarizeCriteria: () => "sykkel",
  deleteSavedSearch: vi.fn(),
  updateSavedSearch: vi.fn(),
}));

import { Route } from "./mine-sok";
const Page = (Route as unknown as { options: { component: ComponentType } }).options.component;

afterEach(cleanup);

// KG-25-F03: «Kjør søk» mistet radius og ekstra søkegrupper.
it("kjører det lagrede søket med radius og ekstra søkegrupper", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Kjør søk/ }));
  expect(mocks.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "/annonser",
      search: expect.objectContaining({
        q: "sykkel",
        radius: 10,
        extraGroups: [{ id: "x", mode: "any", exclude: true, terms: ["ødelagt"] }],
      }),
    }),
  );
});
