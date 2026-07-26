// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTitleBasedListingHints } from "./use-title-based-listing-hints";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/keyword-suggestion.functions", () => ({
  suggestKeywordsForListing: vi.fn(),
}));

vi.mock("@/lib/wtb-listings.functions", () => ({
  matchWtbListingsForListing: vi.fn(),
}));

const neqMock = vi.fn();
const textSearchMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            neq: (...args: unknown[]) => {
              neqMock(...args);
              return { textSearch: (...a: unknown[]) => textSearchMock(...a) };
            },
            textSearch: (...args: unknown[]) => textSearchMock(...args),
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
  neqMock.mockReset();
  textSearchMock.mockReset().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) });
});

describe("useTitleBasedListingHints", () => {
  it("does not exclude any listing when excludeListingId is omitted (create flow)", async () => {
    renderHook(
      () =>
        useTitleBasedListingHints({
          title: "Fin sofa til salgs",
          description: "",
          categoryId: "cat-1",
          setValue: vi.fn(),
        }),
      { wrapper },
    );

    await waitFor(() => expect(textSearchMock).toHaveBeenCalled(), { timeout: 3000 });
    expect(neqMock).not.toHaveBeenCalled();
  });

  it("excludes the given listing id when excludeListingId is provided (edit flow)", async () => {
    renderHook(
      () =>
        useTitleBasedListingHints({
          title: "Fin sofa til salgs",
          description: "",
          categoryId: "cat-1",
          excludeListingId: "listing-1",
          setValue: vi.fn(),
        }),
      { wrapper },
    );

    await waitFor(() => expect(neqMock).toHaveBeenCalledWith("id", "listing-1"), { timeout: 3000 });
  });

  it("appendTagToDescription appends the tag with a leading space", () => {
    const setValue = vi.fn();
    const { result } = renderHook(
      () =>
        useTitleBasedListingHints({
          title: "",
          description: "Fin sofa",
          categoryId: "cat-1",
          setValue,
        }),
      { wrapper },
    );

    act(() => result.current.appendTagToDescription("#sofa"));

    expect(setValue).toHaveBeenCalledWith("description", "Fin sofa #sofa", { shouldTouch: false });
  });
});
