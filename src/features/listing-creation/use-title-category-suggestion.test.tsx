// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTitleCategorySuggestion } from "./use-title-category-suggestion";

const voteMock = vi.fn();
const aiMock = vi.fn();
vi.mock("@/lib/category-suggestion.functions", () => ({
  prefetchCategorySuggestion: (title: string) => voteMock(title),
  suggestCategoryForTitleWithAi: (...args: unknown[]) => aiMock(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const sykkel = { category_id: "c1", parent_id: null, name_nb: "Sykkel", parent_name_nb: null };

beforeEach(() => {
  voteMock.mockReset().mockResolvedValue({ suggestions: [] });
  aiMock.mockReset().mockResolvedValue({ suggestions: [sykkel] });
});

describe("useTitleCategorySuggestion — KI-reserve", () => {
  it("spør Mistral med Turnstile-token når stemmene ikke finner noe", async () => {
    const { result } = renderHook(
      () =>
        useTitleCategorySuggestion({
          title: "Qwxzv plorbnik",
          muted: false,
          aiFallback: { enabled: true, getToken: async () => "token" },
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.categorySuggestions).toEqual([sykkel]));
    expect(aiMock).toHaveBeenCalledWith({
      data: { title: "Qwxzv plorbnik", turnstileToken: "token" },
    });
    expect(result.current.categorySuggestionPending).toBe(false);
  });

  it("spør ikke Mistral når stemmene fant en kategori, eller reserven er av", async () => {
    voteMock.mockResolvedValueOnce({ suggestions: [sykkel] });
    const { result } = renderHook(
      () =>
        useTitleCategorySuggestion({
          title: "Trek terrengsykkel",
          muted: false,
          aiFallback: { enabled: true, getToken: async () => "token" },
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.categorySuggestions).toEqual([sykkel]));

    const off = renderHook(
      () =>
        useTitleCategorySuggestion({
          title: "Qwxzv plorbnik",
          muted: false,
          aiFallback: { enabled: false, getToken: async () => "token" },
        }),
      { wrapper },
    );
    await waitFor(() => expect(off.result.current.categorySuggestionPending).toBe(false));
    expect(off.result.current.categorySuggestions).toEqual([]);
    expect(aiMock).not.toHaveBeenCalled();
  });

  it("prøver igjen neste gang reserven slås på når tokenet uteble", async () => {
    const getToken = vi.fn().mockResolvedValueOnce(null).mockResolvedValue("token");
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useTitleCategorySuggestion({
          title: "Qwxzv plorbnik",
          muted: false,
          aiFallback: { enabled, getToken },
        }),
      { wrapper, initialProps: { enabled: true } },
    );
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.categorySuggestionPending).toBe(false));
    expect(result.current.categorySuggestions).toEqual([]);
    expect(aiMock).not.toHaveBeenCalled();

    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.categorySuggestions).toEqual([sykkel]));
    expect(aiMock).toHaveBeenCalledTimes(1);
  });
});
