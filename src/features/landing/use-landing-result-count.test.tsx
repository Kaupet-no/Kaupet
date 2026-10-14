// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useLandingResultCount } from "./use-landing-result-count";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/use-debounced-value", () => ({ useDebouncedValue: (v: unknown) => v }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it.each([true, false])(
  "KG-35-F01: teller med søkets pris/gratis-kontrakt, includeFree=%s",
  async (includeFree) => {
    let received: unknown;
    rpc.mockImplementation((_fn, args) => {
      received = args;
      return {
        abortSignal: vi.fn(),
        then: (resolve: (r: unknown) => void) =>
          resolve({ data: [{ total_count: includeFree ? 2 : 1 }], error: null }),
      };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useLandingResultCount({
          categoryIds: ["bil"],
          filterValues: { fuel_type: { kind: "select", value: "diesel" } },
          priceMin: 100,
          priceMax: 500,
          includeFree,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current).toBe(includeFree ? 2 : 1));
    expect(rpc).toHaveBeenCalledWith("search_listings_page", expect.anything());
    expect(received).toMatchObject({
      _category_ids: ["bil"],
      _min_price: 100,
      _max_price: 500,
      _include_free: includeFree,
      _include_recently_sold: true,
      _attribute_filters: { fuel_type: { kind: "select", value: "diesel" } },
    });
  },
);
