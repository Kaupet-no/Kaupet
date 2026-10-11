import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getRequestHost: vi.fn(),
  getVippsMode: vi.fn(),
  createVippsPayment: vi.fn(),
  getVippsPayment: vi.fn(),
  captureVippsPayment: vi.fn(),
  supabaseAdmin: { from: vi.fn() },
  context: undefined as unknown,
}));
vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, {
        client: (clientFn: (...args: unknown[]) => unknown) => clientFn,
      }),
  }),
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
vi.mock("@/lib/vipps.server", async (importActual) => ({
  vippsPaymentStatus: (await importActual<typeof import("@/lib/vipps.server")>())
    .vippsPaymentStatus,
  getVippsMode: state.getVippsMode,
  createVippsPayment: state.createVippsPayment,
  getVippsPayment: state.getVippsPayment,
  captureVippsPayment: state.captureVippsPayment,
  releaseSupersededPromotionPayment: vi.fn(),
}));

import { createPromotionCheckout, reconcilePromotionPayment } from "./promotions.functions";

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

// ePayment beholder `state: "AUTHORIZED"` etter capture/refusjon/kansellering;
// hva som er gjort står i `aggregate`.
const nok = (value: number) => ({ value, currency: "NOK" });

beforeEach(() => {
  state.supabaseAdmin.from.mockReset();
  state.getRequestHost.mockReturnValue("test.kaupet.no");
  state.getVippsMode.mockReturnValue("test");
  state.createVippsPayment.mockResolvedValue({ redirectUrl: "https://vipps.test/redirect" });
  state.getVippsPayment.mockReset();
  state.captureVippsPayment.mockReset();
});

describe("reconcilePromotionPayment", () => {
  const pendingPromotion = {
    id: promotionId,
    user_id: "user-1",
    status: "pending",
    duration_days: 7,
    price_nok: 10,
    vipps_reference: "promo-ref",
    vipps_mode: "test",
    expires_at: null,
  };

  it("PAY-05/PAY-07: capturer autorisert betaling med stabil nøkkel og aktiverer bare én gang", async () => {
    state.context = { userId: "user-1" };
    state.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED", pspReference: "psp-1" });
    state.supabaseAdmin.from
      .mockReturnValueOnce(query({ data: pendingPromotion, error: null }))
      .mockReturnValueOnce(
        query({ data: { status: "active", expires_at: "tomorrow" }, error: null }),
      )
      .mockReturnValueOnce(
        query({
          data: { ...pendingPromotion, status: "active", expires_at: "tomorrow" },
          error: null,
        }),
      );

    await expect(
      reconcilePromotionPayment({ data: { promotion_id: promotionId } }),
    ).resolves.toEqual({ status: "active", expires_at: "tomorrow" });
    await expect(
      reconcilePromotionPayment({ data: { promotion_id: promotionId } }),
    ).resolves.toEqual({ status: "active", expires_at: "tomorrow" });
    expect(state.captureVippsPayment).toHaveBeenCalledExactlyOnceWith(
      "promo-ref",
      10,
      `capture-${promotionId}`,
      null,
      "test",
    );
    expect(state.getVippsPayment).toHaveBeenCalledOnce();
  });

  it("PAY-07: aktiverer allerede captured betaling uten ny capture", async () => {
    state.context = { userId: "user-1" };
    state.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900) },
    });
    state.supabaseAdmin.from
      .mockReturnValueOnce(query({ data: pendingPromotion, error: null }))
      .mockReturnValueOnce(
        query({ data: { status: "active", expires_at: "tomorrow" }, error: null }),
      );
    await expect(
      reconcilePromotionPayment({ data: { promotion_id: promotionId } }),
    ).resolves.toMatchObject({ status: "active" });
    expect(state.captureVippsPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["kansellert", { state: "AUTHORIZED", aggregate: { cancelledAmount: nok(4900) } }],
    ["EXPIRED", { state: "EXPIRED" }],
    ["TERMINATED", { state: "TERMINATED" }],
    ["ABORTED", { state: "ABORTED" }],
  ])("PAY-07: markerer %s som feilet uten capture", async (_label, payment) => {
    state.context = { userId: "user-1" };
    state.getVippsPayment.mockResolvedValue(payment);
    state.supabaseAdmin.from
      .mockReturnValueOnce(query({ data: pendingPromotion, error: null }))
      .mockReturnValueOnce({
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      });
    await expect(
      reconcilePromotionPayment({ data: { promotion_id: promotionId } }),
    ).resolves.toEqual({ status: "failed", expires_at: null });
    expect(state.captureVippsPayment).not.toHaveBeenCalled();
  });

  it("PAY-07: avstemmer refundert betaling uten capture", async () => {
    state.context = { userId: "user-1" };
    state.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900), refundedAmount: nok(4900) },
    });
    state.supabaseAdmin.from
      .mockReturnValueOnce(query({ data: pendingPromotion, error: null }))
      .mockReturnValueOnce({
        update: () => ({ eq: () => ({ neq: async () => ({ error: null }) }) }),
      });
    await expect(
      reconcilePromotionPayment({ data: { promotion_id: promotionId } }),
    ).resolves.toEqual({ status: "refunded", expires_at: null });
    expect(state.captureVippsPayment).not.toHaveBeenCalled();
  });

  it("returnerer lagret status når webhooken rekker å oppdatere raden først", async () => {
    state.context = { userId: "user-1" };
    state.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900) },
    });
    state.supabaseAdmin.from
      .mockReturnValueOnce(
        query({
          data: {
            id: promotionId,
            user_id: "user-1",
            status: "pending",
            duration_days: 7,
            price_nok: 10,
            vipps_reference: "promo-ref",
            vipps_mode: "test",
            expires_at: null,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(query({ data: null, error: null }))
      .mockReturnValueOnce(query({ data: { status: "refunded", expires_at: null }, error: null }));

    await expect(
      reconcilePromotionPayment({ data: { promotion_id: promotionId } }),
    ).resolves.toEqual({ status: "refunded", expires_at: null });
    expect(state.captureVippsPayment).not.toHaveBeenCalled();
  });
});

describe("createPromotionCheckout", () => {
  it("avviser vanlig bruker før testbetaling eller sideeffekt", async () => {
    setup([]);

    await expect(
      createPromotionCheckout({
        data: {
          listing_id: listingId,
          duration_days: 7,
          purchase_terms_accepted: true,
          purchase_terms_version: "2.0",
        },
      }),
    ).rejects.toThrow("Ikke autorisert");
    expect(state.supabaseAdmin.from).not.toHaveBeenCalled();
    expect(state.createVippsPayment).not.toHaveBeenCalled();
  });

  it("lar admin eller demo starte testbetaling", async () => {
    setup([{ role: "demo" }]);

    await expect(
      createPromotionCheckout({
        data: {
          listing_id: listingId,
          duration_days: 7,
          purchase_terms_accepted: true,
          purchase_terms_version: "2.0",
        },
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
        data: {
          listing_id: listingId,
          duration_days: 7,
          purchase_terms_accepted: true,
          purchase_terms_version: "2.0",
        },
      }),
    ).resolves.toMatchObject({ promotion_id: promotionId });
  });

  it("starter ikke Vipps-betaling når et konkurrerende forsøk vinner databaseinnsettingen", async () => {
    state.getVippsMode.mockReturnValue("production");
    setup([]);
    const promotionsQuery = state.supabaseAdmin.from("listing_promotions");
    const conflict = { data: null, error: { code: "23505", message: "unique constraint" } };
    promotionsQuery.insert
      .mockReturnValueOnce(query({ data: { id: promotionId }, error: null }))
      .mockReturnValueOnce(query(conflict));

    await expect(
      createPromotionCheckout({
        data: {
          listing_id: listingId,
          duration_days: 7,
          purchase_terms_accepted: true,
          purchase_terms_version: "2.0",
        },
      }),
    ).resolves.toMatchObject({ promotion_id: promotionId });
    await expect(
      createPromotionCheckout({
        data: {
          listing_id: listingId,
          duration_days: 7,
          purchase_terms_accepted: true,
          purchase_terms_version: "2.0",
        },
      }),
    ).rejects.toThrow("Finnes allerede.");
    expect(promotionsQuery.insert).toHaveBeenCalledTimes(2);
    expect(state.createVippsPayment).toHaveBeenCalledOnce();
  });
});
