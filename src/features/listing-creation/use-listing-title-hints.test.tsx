// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useListingTitleHints } from "./use-listing-title-hints";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const suggestCategoryForTitleMock = vi.fn();
vi.mock("@/lib/category-suggestion.functions", () => ({
  suggestCategoryForTitle: (...args: unknown[]) => suggestCategoryForTitleMock(...args),
  prefetchCategorySuggestion: (title: string) => suggestCategoryForTitleMock({ data: { title } }),
}));

const suggestKeywordsForListingMock = vi.fn();
vi.mock("@/lib/keyword-suggestion.functions", () => ({
  suggestKeywordsForListing: (...args: unknown[]) => suggestKeywordsForListingMock(...args),
}));

const matchWtbListingsForListingMock = vi.fn();
vi.mock("@/lib/wtb-listings.functions", () => ({
  matchWtbListingsForListing: (...args: unknown[]) => matchWtbListingsForListingMock(...args),
}));

const textSearchMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            textSearch: (...args: unknown[]) => textSearchMock(...args),
          }),
        }),
      }),
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  suggestCategoryForTitleMock.mockReset();
  suggestKeywordsForListingMock.mockReset();
  matchWtbListingsForListingMock.mockReset();
  textSearchMock.mockReset().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ data: [] }),
  });
});

describe("useListingTitleHints", () => {
  it("suggests a category once the title is at least 5 characters and not yet touched manually", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    suggestCategoryForTitleMock.mockResolvedValue({
      suggestions: [
        {
          category_id: "cat-1",
          parent_id: "parent-1",
          name_nb: "Sykkel",
          parent_name_nb: null,
        },
      ],
    });
    const setValue = vi.fn();
    const { result } = renderHook(
      () =>
        useListingTitleHints({
          title: "Trek Marlin 5",
          description: "",
          categoryId: "",
          categoryTouchedManually: false,
          setSelectedParentId: vi.fn(),
          setCategoryTouchedManually: vi.fn(),
          setValue,
        }),
      { wrapper },
    );

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(result.current.categorySuggestions).toEqual([
      expect.objectContaining({ category_id: "cat-1" }),
    ]);
    vi.useRealTimers();
  });

  it("does not suggest a category once the user has manually touched the category field", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(
      () =>
        useListingTitleHints({
          title: "Trek Marlin 5",
          description: "",
          categoryId: "",
          categoryTouchedManually: true,
          setSelectedParentId: vi.fn(),
          setCategoryTouchedManually: vi.fn(),
          setValue: vi.fn(),
        }),
      { wrapper },
    );

    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(result.current.categorySuggestions).toEqual([]);
    expect(suggestCategoryForTitleMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("applyCategorySuggestion writes the suggested category and clears the suggestions", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    suggestCategoryForTitleMock.mockResolvedValue({
      suggestions: [
        {
          category_id: "cat-1",
          parent_id: "parent-1",
          name_nb: "Sykkel",
          parent_name_nb: null,
        },
      ],
    });
    const setValue = vi.fn();
    const setSelectedParentId = vi.fn();
    const setCategoryTouchedManually = vi.fn();
    const { result } = renderHook(
      () =>
        useListingTitleHints({
          title: "Trek Marlin 5",
          description: "",
          categoryId: "",
          categoryTouchedManually: false,
          setSelectedParentId,
          setCategoryTouchedManually,
          setValue,
        }),
      { wrapper },
    );
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(result.current.categorySuggestions).not.toEqual([]);

    act(() => result.current.applyCategorySuggestion("cat-1"));

    expect(setSelectedParentId).toHaveBeenCalledWith("parent-1");
    expect(setValue).toHaveBeenCalledWith("category_id", "cat-1", { shouldValidate: true });
    expect(setCategoryTouchedManually).toHaveBeenCalledWith(true);
    expect(result.current.categorySuggestions).toEqual([]);
    vi.useRealTimers();
  });
});
