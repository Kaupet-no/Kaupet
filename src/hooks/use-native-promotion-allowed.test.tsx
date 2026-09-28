// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNativePromotionAllowed } from "./use-native-promotion-allowed";

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

let native = false;
vi.mock("@/lib/native", () => ({ isNative: () => native }));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  native = false;
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("useNativePromotionAllowed", () => {
  it("is always allowed on web, without querying site_settings", () => {
    native = false;
    const { result } = renderHook(() => useNativePromotionAllowed(), { wrapper });

    expect(result.current).toBe(true);
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("is allowed on native when the switch is on", async () => {
    native = true;
    maybeSingleMock.mockResolvedValue({ data: { native_promotion_enabled: true }, error: null });
    const { result } = renderHook(() => useNativePromotionAllowed(), { wrapper });

    await waitFor(() => expect(maybeSingleMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("is blocked on native when the switch is off", async () => {
    native = true;
    maybeSingleMock.mockResolvedValue({ data: { native_promotion_enabled: false }, error: null });
    const { result } = renderHook(() => useNativePromotionAllowed(), { wrapper });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("defaults to allowed on native when the row is missing (pre-migration app builds)", async () => {
    native = true;
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useNativePromotionAllowed(), { wrapper });

    await waitFor(() => expect(maybeSingleMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(true);
  });
});
