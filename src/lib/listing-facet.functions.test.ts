import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data) });
    };
    Object.assign(fn, {
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/lib/rate-limit.server", () => ({ assertNotRateLimited: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: rpcMock },
}));

import { getListingFacetCounts } from "./listing-facet.functions";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("getListingFacetCounts", () => {
  it("sender facetnøklene videre til RPC-en", async () => {
    rpcMock.mockResolvedValue({
      data: [{ key: "condition", value: "new", count: 2 }],
      error: null,
    });

    await expect(
      getListingFacetCounts({
        data: {
          categoryIds: null,
          conditions: null,
          priceMin: null,
          priceMax: null,
          includeFree: true,
          activeAttrs: {},
          facetKeys: ["condition", "fuel_type"],
        },
      }),
    ).resolves.toEqual([{ key: "condition", value: "new", count: 2 }]);

    expect(rpcMock).toHaveBeenCalledWith(
      "listing_filter_facet_counts",
      expect.objectContaining({ p_facet_keys: ["condition", "fuel_type"] }),
    );
  });
});
