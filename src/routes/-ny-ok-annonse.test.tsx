// @vitest-environment jsdom
import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  prepare: vi.fn(),
  errorToast: vi.fn(),
  clearAfterPublish: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => ({ title: "Ønsker en sykkel" }),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ history: { back: vi.fn(), length: 1 } }),
  useBlocker: () => ({ status: "idle" }),
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ loading: false, user: { id: "user-1" } }),
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-categories", () => ({
  useCategories: () => ({ data: [] }),
  visibleCategories: () => [],
}));
vi.mock("@/hooks/use-user-roles", () => ({ useIsDemo: () => ({ data: false }) }));
vi.mock("@/components/attribute-fields", () => ({ useAllCategoryFilters: () => ({ data: [] }) }));
vi.mock("@/features/listing-creation/use-title-category-suggestion", () => ({
  useTitleCategorySuggestion: () => ({ categorySuggestions: [], categorySuggestionPending: false }),
}));
vi.mock("@/features/listing-creation/use-vehicle-title-category-hint", () => ({
  useVehicleTitleCategoryHint: () => null,
}));
vi.mock("@/features/wtb/use-wtb-existing-matches", () => ({
  useWtbExistingMatches: () => ({ data: null }),
}));
vi.mock("@/features/wtb/use-wtb-draft-autosave", () => ({
  useWtbDraftAutosave: () => ({
    ownerId: "user-1",
    isCurrent: () => true,
    preparePublish: mocks.prepare,
    clearAfterPublish: mocks.clearAfterPublish,
    resumeAutosave: vi.fn(),
  }),
}));
vi.mock("@/lib/wtb-listings.functions", () => ({ createWtbListing: mocks.create }));
vi.mock("@/lib/toast", () => ({ showErrorToast: mocks.errorToast }));
vi.mock("@/lib/haptics", () => ({ hapticNotification: vi.fn(), hapticSelection: vi.fn() }));

import { Route } from "./ny-ok-annonse";
const WantPage = Route.options.component as ComponentType;
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  mocks.prepare.mockResolvedValue({ id: "wtb-1", published: false });
});

it.each([false, true])(
  "varsler om ulagrede endringer bare når et annet forsøk allerede publiserte (%s)",
  async (alreadyPublished) => {
    mocks.create.mockResolvedValue({ id: "wtb-1", already_published: alreadyPublished });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WantPage />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Neste:/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Jeg er usikker – fortsett uten kategori" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Neste:/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Neste:/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Publiser/ }));
    await screen.findByRole("heading", { name: "Ønskes kjøpt-annonse publisert!" });
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
    if (alreadyPublished) {
      expect(mocks.errorToast).toHaveBeenCalledWith(
        "Kjøpsønsket er allerede publisert. Endringer fra dette forsøket er ikke lagret. Rediger det publiserte kjøpsønsket.",
      );
    } else {
      expect(mocks.errorToast).not.toHaveBeenCalled();
    }
    await waitFor(() => expect(mocks.clearAfterPublish).toHaveBeenCalledOnce());
  },
);
