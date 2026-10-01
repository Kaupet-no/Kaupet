import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = {
  table: string;
  op: "insert" | "update";
  values: Record<string, unknown>;
  inFilters?: Record<string, unknown>;
  neqFilters?: Record<string, unknown>;
};

const s = vi.hoisted(() => ({
  secret: "test-secret" as string,
  rejection: null as string | null,
  fresh: true,
  existingEvent: null as { id: string; processed_at: string | null } | null,
  promo: null as Record<string, unknown> | null,
  /** Andre aktive/ventende/gavefremhevinger på samme annonse (default: ingen). */
  live: [] as { id: string }[],
  logServerError: vi.fn(),
  updateError: {} as Record<string, unknown>,
  calls: [] as Call[],
  getVippsPayment: vi.fn(),
  captureVippsPayment: vi.fn(),
  releaseSupersededPromotionPayment: vi.fn(),
}));

vi.mock("@/lib/vipps.server", async (importActual) => ({
  vippsPaymentStatus: (await importActual<typeof import("@/lib/vipps.server")>())
    .vippsPaymentStatus,
  getVippsWebhookSecret: async () => s.secret,
  getVippsWebhookRejectionReason: () => s.rejection,
  getVippsWebhookEventId: (p: { pspReference?: string }) => p.pspReference ?? null,
  isFreshVippsWebhookDate: () => s.fresh,
  getVippsPayment: s.getVippsPayment,
  captureVippsPayment: s.captureVippsPayment,
  releaseSupersededPromotionPayment: s.releaseSupersededPromotionPayment,
}));

vi.mock("@/lib/server-error-log", () => ({ logServerError: s.logServerError }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          in: () => ({ neq: () => ({ limit: async () => ({ data: s.live, error: null }) }) }),
          maybeSingle: async () => ({
            data: table === "vipps_webhook_events" ? s.existingEvent : s.promo,
            error: null,
          }),
        }),
      }),
      insert: async (values: Record<string, unknown>) => {
        s.calls.push({ table, op: "insert", values });
        return { error: null };
      },
      update: (values: Record<string, unknown>) => {
        const call: Call = { table, op: "update", values };
        s.calls.push(call);
        const result = { error: s.updateError[`${table}:${String(values.status ?? "")}`] ?? null };
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: (col: string, vals: unknown[]) => {
            call.inFilters = { ...call.inFilters, [col]: vals };
            return chain;
          },
          neq: (col: string, val: unknown) => {
            call.neqFilters = { ...call.neqFilters, [col]: val };
            return chain;
          },
          then: (resolve: (v: unknown) => void) => resolve(result),
        };
        return chain;
      },
    }),
  },
}));

const pendingPromo = {
  id: "promo-1",
  status: "pending",
  duration_days: 7,
  price_nok: 10,
  vipps_mode: "test",
};

async function post(opts: { body?: string; host?: string | null } = {}) {
  const { Route } = await import("./webhook");
  const headers: Record<string, string> = { "x-ms-date": new Date().toUTCString() };
  if (opts.host !== null) headers.host = opts.host ?? "test.kaupet.no";
  const request = new Request("https://test.kaupet.no/api/public/vipps/webhook", {
    method: "POST",
    headers,
    body: opts.body ?? JSON.stringify({ pspReference: "evt-1", reference: "ref-1" }),
  });
  // @ts-expect-error server handlers er tilgjengelige i runtime
  return Route.options.server.handlers.POST({ request }) as Promise<Response>;
}

const promoUpdates = () => s.calls.filter((c) => c.table === "listing_promotions");
const processed = () =>
  s.calls.some((c) => c.table === "vipps_webhook_events" && c.op === "update");

// ePayment beholder `state: "AUTHORIZED"` etter capture/refusjon/kansellering;
// hva som er gjort står i `aggregate`.
const nok = (value: number) => ({ value, currency: "NOK" });

beforeEach(() => {
  s.secret = "test-secret";
  s.rejection = null;
  s.fresh = true;
  s.existingEvent = null;
  s.promo = { ...pendingPromo };
  s.updateError = {};
  s.live = [];
  s.logServerError.mockReset().mockResolvedValue(undefined);
  s.releaseSupersededPromotionPayment.mockReset().mockResolvedValue(undefined);
  s.calls = [];
  s.getVippsPayment.mockReset().mockResolvedValue({
    state: "AUTHORIZED",
    aggregate: { capturedAmount: nok(4900) },
    pspReference: "psp-1",
  });
  s.captureVippsPayment.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Vipps-webhook: autentisering og validering", () => {
  it("avviser (fail closed) når webhook-hemmelighet mangler", async () => {
    s.secret = "";
    const res = await post();
    expect(res.status).toBe(401);
    expect(s.getVippsPayment).not.toHaveBeenCalled();
    expect(s.calls).toEqual([]);
  });

  it("avviser ugyldig signatur uten sideeffekt", async () => {
    s.rejection = "signature_mismatch";
    expect((await post()).status).toBe(401);
    expect(s.calls).toEqual([]);
    expect(s.getVippsPayment).not.toHaveBeenCalled();
  });

  it("avviser forespørsel uten host-header", async () => {
    expect((await post({ host: null })).status).toBe(401);
    expect(s.calls).toEqual([]);
  });

  it("svarer 400 på ugyldig JSON", async () => {
    expect((await post({ body: "{not json" })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it("svarer 400 når hendelses-ID mangler", async () => {
    expect((await post({ body: JSON.stringify({ reference: "ref-1" }) })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it("avviser ny, utdatert hendelse uten å lagre den", async () => {
    s.fresh = false;
    expect((await post()).status).toBe(401);
    expect(s.calls).toEqual([]);
  });

  it("behandler kjent, uferdig hendelse på nytt selv om datoen er utdatert (retry)", async () => {
    s.fresh = false;
    s.existingEvent = { id: "e1", processed_at: null };
    expect((await post()).status).toBe(200);
    expect(s.calls.some((c) => c.op === "insert")).toBe(false);
    expect(promoUpdates()).toHaveLength(1);
    expect(processed()).toBe(true);
  });

  it("lagrer ny hendelse med navn fra eventName-feltet", async () => {
    await post({
      body: JSON.stringify({ pspReference: "evt-1", reference: "ref-1", eventName: "x.y" }),
    });
    expect(s.calls[0]).toMatchObject({
      table: "vipps_webhook_events",
      op: "insert",
      values: { event_id: "evt-1", reference: "ref-1", event_name: "x.y" },
    });
  });
});

describe("Vipps-webhook: oppslag", () => {
  it("markerer hendelse uten reference som behandlet uten å røre fremhevinger", async () => {
    const res = await post({ body: JSON.stringify({ pspReference: "evt-1" }) });
    expect(res.status).toBe(200);
    expect(processed()).toBe(true);
    expect(promoUpdates()).toEqual([]);
    expect(s.getVippsPayment).not.toHaveBeenCalled();
  });

  it("markerer hendelse for ukjent fremheving som behandlet", async () => {
    s.promo = null;
    expect((await post()).status).toBe(200);
    expect(processed()).toBe(true);
    expect(s.getVippsPayment).not.toHaveBeenCalled();
  });

  it("svarer 503 og lar hendelsen stå ubehandlet når Vipps-oppslag feiler", async () => {
    s.getVippsPayment.mockRejectedValue(new Error("vipps nede"));
    expect((await post()).status).toBe(503);
    expect(processed()).toBe(false);
    expect(promoUpdates()).toEqual([]);
  });

  it("bruker fremhevingens lagrede vipps_mode, ikke request-host", async () => {
    await post();
    expect(s.getVippsPayment).toHaveBeenCalledWith("ref-1", "test.kaupet.no", "test");
  });
});

describe("Vipps-webhook: statusoverganger", () => {
  it("AUTHORIZED: capturer og aktiverer med utløpsdato fra duration_days", async () => {
    s.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED", pspReference: "psp-9" });
    expect((await post()).status).toBe(200);
    expect(s.captureVippsPayment).toHaveBeenCalledOnce();
    const [update] = promoUpdates();
    expect(update.values).toMatchObject({ status: "active", vipps_psp_reference: "psp-9" });
    const days =
      (Date.parse(update.values.expires_at as string) -
        Date.parse(update.values.starts_at as string)) /
      86_400_000;
    expect(days).toBe(7);
    expect(processed()).toBe(true);
  });

  it("AUTHORIZED: feilet capture gir 503, aktiverer ikke og lar hendelsen stå ubehandlet", async () => {
    s.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED" });
    s.captureVippsPayment.mockRejectedValue(new Error("capture feilet"));
    expect((await post()).status).toBe(503);
    expect(promoUpdates()).toEqual([]);
    expect(processed()).toBe(false);
  });

  it("CAPTURED: aktiverer uten ny capture; psp-referanse null når den mangler", async () => {
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900) },
    });
    await post();
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(promoUpdates()[0].values).toMatchObject({ status: "active", vipps_psp_reference: null });
  });

  it.each([
    ["AUTHORIZED", {}],
    ["belastet", { capturedAmount: nok(1000) }],
  ])(
    "%s på allerede aktiv fremheving endrer ingenting, men markerer hendelsen behandlet",
    async (_label, aggregate) => {
      s.promo = { ...pendingPromo, status: "active" };
      s.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED", aggregate });
      expect((await post()).status).toBe(200);
      expect(s.captureVippsPayment).not.toHaveBeenCalled();
      expect(promoUpdates()).toEqual([]);
      expect(processed()).toBe(true);
    },
  );

  it("CAPTURED på failed fremheving (betalt etter reconcile): aktiverer med betingelse pending|failed", async () => {
    s.promo = { ...pendingPromo, status: "failed" };
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900) },
      pspReference: "psp-2",
    });
    expect((await post()).status).toBe(200);
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    const [update] = promoUpdates();
    expect(update.values).toMatchObject({ status: "active", vipps_psp_reference: "psp-2" });
    expect(update.inFilters).toEqual({ status: ["pending", "failed"] });
    expect(processed()).toBe(true);
  });

  it("AUTHORIZED på failed fremheving: capturer med samme nøkkel, deretter aktiver", async () => {
    s.promo = { ...pendingPromo, status: "failed" };
    s.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED" });
    expect((await post()).status).toBe(200);
    expect(s.captureVippsPayment).toHaveBeenCalledWith(
      "ref-1",
      10,
      "capture-promo-1",
      "test.kaupet.no",
      "test",
    );
    expect(promoUpdates().map((c) => c.values.status)).toEqual(["active"]);
  });

  it("failed + CAPTURED + annen aktiv fremheving: ingen aktivering, logget, hendelsen behandlet", async () => {
    s.promo = { ...pendingPromo, status: "failed", listing_id: "l-1" };
    s.live = [{ id: "promo-2" }];
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900) },
    });
    expect((await post()).status).toBe(200);
    expect(promoUpdates()).toEqual([]);
    expect(s.logServerError).toHaveBeenCalledWith(
      "vippsWebhook.paidSupersededPromotion",
      expect.any(Error),
      { promotion_id: "promo-1" },
    );
    expect(s.releaseSupersededPromotionPayment).toHaveBeenCalledWith({
      promotionId: "promo-1",
      reference: "ref-1",
      amountNok: 10,
      captured: true,
      host: "test.kaupet.no",
      mode: "test",
    });
    expect(processed()).toBe(true);
  });

  it("superseded + release feiler: 503 og hendelsen står ubehandlet", async () => {
    s.promo = { ...pendingPromo, status: "failed", listing_id: "l-1" };
    s.live = [{ id: "promo-2" }];
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900) },
    });
    s.releaseSupersededPromotionPayment.mockRejectedValue(new Error("vipps nede"));
    expect((await post()).status).toBe(503);
    expect(s.logServerError).toHaveBeenCalledWith(
      "vippsWebhook.releaseSupersededPayment",
      expect.any(Error),
      { promotion_id: "promo-1" },
    );
    expect(processed()).toBe(false);
  });

  it("failed + AUTHORIZED + annen aktiv fremheving: capture kalles ikke", async () => {
    s.promo = { ...pendingPromo, status: "failed", listing_id: "l-1" };
    s.live = [{ id: "promo-2" }];
    s.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED" });
    expect((await post()).status).toBe(200);
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(promoUpdates()).toEqual([]);
    expect(s.logServerError).toHaveBeenCalled();
    expect(s.releaseSupersededPromotionPayment).toHaveBeenCalledWith(
      expect.objectContaining({ captured: false }),
    );
    expect(processed()).toBe(true);
  });

  it("failed + AUTHORIZED med belastet beløp (ePayment) + annen aktiv: refunderer", async () => {
    // ePayment beholder state AUTHORIZED etter capture; aggregate viser beløpet.
    s.promo = { ...pendingPromo, status: "failed", listing_id: "l-1" };
    s.live = [{ id: "promo-2" }];
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: { value: 4900, currency: "NOK" } },
    });
    expect((await post()).status).toBe(200);
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(s.releaseSupersededPromotionPayment).toHaveBeenCalledWith(
      expect.objectContaining({ captured: true }),
    );
  });

  it("failed + CAPTURED: 23505 ved aktivering (kappløp) logges, svarer 200 og markerer behandlet", async () => {
    s.promo = { ...pendingPromo, status: "failed", listing_id: "l-1" };
    s.updateError["listing_promotions:active"] = { code: "23505" };
    expect((await post()).status).toBe(200);
    expect(s.logServerError).toHaveBeenCalledWith(
      "vippsWebhook.paidSupersededPromotion",
      { code: "23505" },
      { promotion_id: "promo-1" },
    );
    expect(s.releaseSupersededPromotionPayment).toHaveBeenCalledWith(
      expect.objectContaining({ captured: true }),
    );
    expect(processed()).toBe(true);
  });

  it("CANCELLED på failed fremheving endrer ingenting", async () => {
    s.promo = { ...pendingPromo, status: "failed" };
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { cancelledAmount: nok(4900) },
    });
    expect((await post()).status).toBe(200);
    expect(promoUpdates()).toEqual([]);
  });

  it("feil ved aktivering kaster og lar hendelsen stå ubehandlet (Vipps prøver igjen)", async () => {
    s.updateError["listing_promotions:active"] = { message: "db nede" };
    await expect(post()).rejects.toMatchObject({ message: "db nede" });
    expect(processed()).toBe(false);
  });

  it.each([
    ["kansellert", { state: "AUTHORIZED", aggregate: { cancelledAmount: nok(1000) } }],
    ["EXPIRED", { state: "EXPIRED" }],
    ["TERMINATED", { state: "TERMINATED" }],
    ["ABORTED", { state: "ABORTED" }],
  ])("%s: markerer ventende fremheving som failed", async (_label, payment) => {
    s.getVippsPayment.mockResolvedValue(payment);
    expect((await post()).status).toBe(200);
    expect(promoUpdates().map((c) => c.values)).toEqual([{ status: "failed" }]);
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(processed()).toBe(true);
  });

  it("avbrutt betaling nedgraderer ikke en allerede aktiv fremheving", async () => {
    s.promo = { ...pendingPromo, status: "active" };
    s.getVippsPayment.mockResolvedValue({ state: "ABORTED" });
    expect((await post()).status).toBe(200);
    expect(promoUpdates()).toEqual([]);
  });

  it("feil ved failed-oppdatering kaster og lar hendelsen stå ubehandlet", async () => {
    s.getVippsPayment.mockResolvedValue({ state: "EXPIRED" });
    s.updateError["listing_promotions:failed"] = { message: "db nede" };
    await expect(post()).rejects.toMatchObject({ message: "db nede" });
    expect(processed()).toBe(false);
  });

  it("refundert (f.eks. i Vipps-portalen): aktiv fremheving blir refunded med tidspunkt", async () => {
    // ePayment: state forblir AUTHORIZED, refusjonen står bare i aggregate.
    s.promo = { ...pendingPromo, status: "active" };
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(1000), refundedAmount: nok(1000) },
    });
    expect((await post()).status).toBe(200);
    expect(promoUpdates()).toMatchObject([
      {
        values: { status: "refunded", refunded_at: expect.any(String) },
        neqFilters: { status: "refunded" },
      },
    ]);
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(processed()).toBe(true);
  });

  it("delvis refundert: aktiv fremheving beholdes og hendelsen markeres behandlet", async () => {
    s.promo = { ...pendingPromo, status: "active" };
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(1000), refundedAmount: nok(500) },
    });
    expect((await post()).status).toBe(200);
    expect(promoUpdates()).toEqual([]);
    expect(processed()).toBe(true);
  });

  it("kansellert reservasjon på failed fremheving uten annen aktiv: ingen capture-løkke", async () => {
    // releaseSupersededPromotionPayment kansellerer ubelastede betalinger og
    // lar raden stå failed; en senere hendelse må ikke prøve å capture.
    s.promo = { ...pendingPromo, status: "failed" };
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { authorizedAmount: nok(1000), cancelledAmount: nok(1000) },
    });
    expect((await post()).status).toBe(200);
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(promoUpdates()).toEqual([]);
    expect(processed()).toBe(true);
  });

  it("feil ved refunded-oppdatering kaster og lar hendelsen stå ubehandlet", async () => {
    s.getVippsPayment.mockResolvedValue({
      state: "AUTHORIZED",
      aggregate: { capturedAmount: nok(4900), refundedAmount: nok(4900) },
    });
    s.updateError["listing_promotions:refunded"] = { message: "db nede" };
    await expect(post()).rejects.toMatchObject({ message: "db nede" });
    expect(processed()).toBe(false);
  });

  it("CREATED (epayments.payment.created.v1): markerer behandlet uten endring", async () => {
    s.getVippsPayment.mockResolvedValue({ state: "CREATED" });
    expect((await post()).status).toBe(200);
    expect(promoUpdates()).toEqual([]);
    expect(processed()).toBe(true);
  });

  it("ukjent tilstand fra Vipps: svarer 503 uten å markere behandlet", async () => {
    s.getVippsPayment.mockResolvedValue({ state: "NOE_NYTT" });
    expect((await post()).status).toBe(503);
    expect(promoUpdates()).toEqual([]);
    expect(processed()).toBe(false);
  });
});
