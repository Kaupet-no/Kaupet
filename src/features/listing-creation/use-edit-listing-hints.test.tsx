// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditListingHints } from "./use-edit-listing-hints";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const suggestKeywordsForListingMock = vi.fn();
vi.mock("@/lib/keyword-suggestion.functions", () => ({
  suggestKeywordsForListing: (...args: unknown[]) => suggestKeywordsForListingMock(...args),
}));

const matchWtbListingsForListingMock = vi.fn();
vi.mock("@/lib/wtb-listings.functions", () => ({
  matchWtbListingsForListing: (...args: unknown[]) => matchWtbListingsForListingMock(...args),
}));

const neqMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            neq: (...args: unknown[]) => {
              neqMock(...args);
              return {
                textSearch: () => ({
                  limit: vi.fn().mockResolvedValue({ data: [{ id: "other-listing" }] }),
                }),
              };
            },
          }),
        }),
      }),
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  suggestKeywordsForListingMock.mockReset();
  matchWtbListingsForListingMock.mockReset();
  neqMock.mockReset();
});

describe("useEditListingHints", () => {
  it("appendTagToDescription appends the tag with a leading space", () => {
    const setValue = vi.fn();
    const { result } = renderHook(
      () =>
        useEditListingHints({
          title: "",
          description: "Fin sofa",
          categoryId: "cat-1",
          listingId: "listing-1",
          setValue,
        }),
      { wrapper },
    );

    act(() => result.current.appendTagToDescription("#sofa"));

    expect(setValue).toHaveBeenCalledWith("description", "Fin sofa #sofa", { shouldTouch: false });
  });

  it("excludes the listing being edited from the similar-listings search", async () => {
    renderHook(
      () =>
        useEditListingHints({
          title: "Fin sofa til salgs",
          description: "",
          categoryId: "cat-1",
          listingId: "listing-1",
          setValue: vi.fn(),
        }),
      { wrapper },
    );

    await waitFor(() => expect(neqMock).toHaveBeenCalledWith("id", "listing-1"), { timeout: 3000 });
  });

  it("fetches a WTB match once the debounced title reaches 3 characters", async () => {
    matchWtbListingsForListingMock.mockResolvedValue({ id: "wtb-1" });
    const { result } = renderHook(
      () =>
        useEditListingHints({
          title: "Sof",
          description: "",
          categoryId: "cat-1",
          listingId: "listing-1",
          setValue: vi.fn(),
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.wtbMatch).toEqual({ id: "wtb-1" }), {
      timeout: 3000,
    });
    expect(matchWtbListingsForListingMock).toHaveBeenCalledWith({
      data: { title: "Sof", category_id: "cat-1" },
    });
  });
});
