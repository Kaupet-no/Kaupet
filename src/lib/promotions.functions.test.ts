import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getRequestHost: vi.fn(),
  getVippsMode: vi.fn(),
  createVippsPayment: vi.fn(),
  supabaseAdmin: { from: vi.fn() },
  context: undefined as unknown,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown; context?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data), context: input.context ?? state.context });
    };
    Object.assign(fn, {
      middleware: () => fn,
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
  getRequestHost: state.getRequestHost,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: state.supabaseAdmin }));
vi.mock("@/lib/vipps.server", () => ({
  getVippsMode: state.getVippsMode,
  createVippsPayment: state.createVippsPayment,
}));

import { createPromotionCheckout } from "./promotions.functions";

const listingId = "11111111-1111-4111-8111-111111111111";
const promotionId = "22222222-2222-4222-8222-222222222222";

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "insert", "update"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  chain.single = vi.fn(async () => result);
  return chain;
}

function setup(roleRows: { role: string }[]) {
  const roleQuery = query({ data: roleRows, error: null });
  const listingQuery = query({
    data: { id: listingId, seller_id: "user-1", status: "active", title: "Testannonse" },
    error: null,
  });
  const pricingQuery = query({ data: { price_nok: 10 }, error: null });
  const promotionsQuery = query({ data: null, error: null });
  const insertQuery = query({ data: { id: promotionId }, error: null });
  promotionsQuery.insert = vi.fn(() => insertQuery);

  const supabase = {
    from: vi.fn((table: string) => (table === "user_roles" ? roleQuery : listingQuery)),
  };
  state.context = { supabase, userId: "user-1" };
  state.supabaseAdmin.from.mockImplementation((table: string) => {
    if (table === "promotion_pricing") return pricingQuery;
    return promotionsQuery;
  });
  return { supabase, supabaseAdmin: state.supabaseAdmin };
}

beforeEach(() => {
  state.supabaseAdmin.from.mockReset();
  state.getRequestHost.mockReturnValue("test.kaupet.no");
  state.getVippsMode.mockReturnValue("test");
  state.createVippsPayment.mockResolvedValue({ redirectUrl: "https://vipps.test/redirect" });
});

describe("createPromotionCheckout", () => {
  it("avviser vanlig bruker før testbetaling eller sideeffekt", async () => {
    setup([]);

    await expect(
      createPromotionCheckout({
        data: { listing_id: listingId, duration_days: 7 },
      }),
    ).rejects.toThrow("Ikke autorisert");
    expect(state.supabaseAdmin.from).not.toHaveBeenCalled();
    expect(state.createVippsPayment).not.toHaveBeenCalled();
  });

  it("lar admin eller demo starte testbetaling", async () => {
    setup([{ role: "demo" }]);

    await expect(
      createPromotionCheckout({
        data: { listing_id: listingId, duration_days: 7 },
      }),
    ).resolves.toEqual({
      promotion_id: promotionId,
      redirect_url: "https://vipps.test/redirect",
    });
    expect(state.createVippsPayment).toHaveBeenCalledOnce();
    expect(state.supabaseAdmin.from).toHaveBeenCalled();
  });

  it("lar vanlig bruker starte produksjonsbetaling", async () => {
    state.getVippsMode.mockReturnValue("production");
    setup([]);

    await expect(
      createPromotionCheckout({
        data: { listing_id: listingId, duration_days: 7 },
      }),
    ).resolves.toMatchObject({ promotion_id: promotionId });
  });
});
