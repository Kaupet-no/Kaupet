// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePopularListings } from "./use-popular-listings";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function row(overrides: Partial<{ listing_id: string; views_last_week: number }> = {}) {
  return {
    listing_id: "l-1",
    kaupet_code: "12345678",
    title: "Sofa",
    subtitle: null,
    price_nok: 500,
    is_free: false,
    city: "Oslo",
    created_at: new Date().toISOString(),
    cover_path: "cover.jpg",
    total_views: 0,
    views_last_week: 0,
    mileage_km: null,
    category_slug: null,
    attributes: null,
    ...overrides,
  };
}

beforeEach(() => rpcMock.mockReset());

describe("usePopularListings", () => {
  it("hasPopularitySignal er false når ingen annonser har reelle visninger denne uken", async () => {
    rpcMock.mockResolvedValue({
      data: [row({ views_last_week: 0 }), row({ listing_id: "l-2", views_last_week: 0 })],
      error: null,
    });
    const { result } = renderHook(() => usePopularListings(), { wrapper });

    await waitFor(() => expect(result.current.popular).toBeDefined());
    expect(result.current.hasPopularitySignal).toBe(false);
  });

  it("hasPopularitySignal er true så snart minst én annonse har reelle visninger", async () => {
    rpcMock.mockResolvedValue({
      data: [row({ views_last_week: 0 }), row({ listing_id: "l-2", views_last_week: 3 })],
      error: null,
    });
    const { result } = renderHook(() => usePopularListings(), { wrapper });

    await waitFor(() => expect(result.current.popular).toBeDefined());
    expect(result.current.hasPopularitySignal).toBe(true);
  });

  it("hasPopularitySignal er false når listen er tom", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => usePopularListings(), { wrapper });

    await waitFor(() => expect(result.current.popular).toBeDefined());
    expect(result.current.hasPopularitySignal).toBe(false);
  });
});
