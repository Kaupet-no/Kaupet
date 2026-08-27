// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_SUGGESTIONS } from "@/lib/search-suggestions";
import { useDefaultSearchExamples } from "./use-default-search-examples";

const maybeSingleMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: (...args: unknown[]) => maybeSingleMock(...args) }),
      }),
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("useDefaultSearchExamples", () => {
  it("falls back to built-in suggestions when site settings are absent", async () => {
    const { result } = renderHook(() => useDefaultSearchExamples(), { wrapper });

    await waitFor(() => expect(maybeSingleMock).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual(SEARCH_SUGGESTIONS);
  });
});
