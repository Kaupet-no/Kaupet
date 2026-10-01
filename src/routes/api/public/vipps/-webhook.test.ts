import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  processed: false,
  promotionStatus: "pending",
  getVippsPayment: vi.fn(),
  captureVippsPayment: vi.fn(),
  updatePromotion: vi.fn(),
}));

vi.mock("@/lib/vipps.server", async (importActual) => ({
  isVippsPaymentCaptured: (await importActual<typeof import("@/lib/vipps.server")>())
    .isVippsPaymentCaptured,
  getVippsWebhookSecret: async () => "test-secret",
  getVippsWebhookRejectionReason: () => null,
  getVippsWebhookEventId: (payload: { pspReference?: string }) => payload.pspReference,
  isFreshVippsWebhookDate: () => true,
  getVippsPayment: state.getVippsPayment,
  captureVippsPayment: state.captureVippsPayment,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "vipps_webhook_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.processed
                  ? { id: "event-1", processed_at: new Date().toISOString() }
                  : null,
                error: null,
              }),
            }),
          }),
          insert: async () => ({ error: null }),
          update: () => ({
            eq: async () => {
              state.processed = true;
              return { error: null };
            },
          }),
        };
      }
      if (table === "listing_promotions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "promo-1",
                  status: state.promotionStatus,
                  duration_days: 7,
                  price_nok: 10,
                  vipps_mode: "test",
                },
                error: null,
              }),
            }),
          }),
          update: state.updatePromotion,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

async function post() {
  const { Route } = await import("./webhook");
  const request = new Request("https://test.kaupet.no/api/public/vipps/webhook", {
    method: "POST",
    headers: { host: "test.kaupet.no", "x-ms-date": new Date().toUTCString() },
    body: JSON.stringify({
      pspReference: "event-1",
      reference: "payment-1",
      name: "payment.captured",
    }),
  });
  // @ts-expect-error server handlers er tilgjengelige i runtime
  return Route.options.server.handlers.POST({ request });
}

beforeEach(() => {
  state.processed = false;
  state.promotionStatus = "pending";
  state.getVippsPayment.mockReset().mockResolvedValue({ state: "CAPTURED" });
  state.captureVippsPayment.mockReset().mockResolvedValue(undefined);
  state.updatePromotion.mockReset().mockImplementation(() => ({
    eq: () => ({
      in: async () => {
        state.promotionStatus = "active";
        return { error: null };
      },
    }),
  }));
});

describe("Vipps-webhook", () => {
  it("behandler samme hendelses-ID bare én gang ved retry", async () => {
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect(state.getVippsPayment).toHaveBeenCalledOnce();
    expect(state.updatePromotion).toHaveBeenCalledOnce();
  });

  it("PAY-08: capturer autorisert betaling med stabil nøkkel og gjentar ikke ved webhook-retry", async () => {
    state.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED" });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect(state.captureVippsPayment).toHaveBeenCalledExactlyOnceWith(
      "payment-1",
      10,
      "capture-promo-1",
      "test.kaupet.no",
      "test",
    );
  });
});
