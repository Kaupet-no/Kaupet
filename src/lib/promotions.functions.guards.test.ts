import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: unknown };

const s = vi.hoisted(() => ({
  host: "kaupet.no" as string | null,
  vippsMode: "production" as "test" | "production",
  createVippsPayment: vi.fn(),
  getVippsPayment: vi.fn(),
  captureVippsPayment: vi.fn(),
  releaseSupersededPromotionPayment: vi.fn(),
  logServerError: vi.fn(),
  /** Køer med resultater per tabell; hvert terminalkall (maybeSingle/single/await) tar neste. */
  queues: {} as Record<string, Result[]>,
  ops: [] as { table: string; op: string; values?: unknown }[],
  context: undefined as unknown,
}));

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, { client: (c: (...args: unknown[]) => unknown) => c }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown } = {}) =>
      handler!({ data: validator(input.data), context: s.context });
    Object.assign(fn, {
      middleware: () => fn,
      validator: (v: typeof validator) => ((validator = v), fn),
      handler: (h: typeof handler) => ((handler = h), fn),
    });
    return fn;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHost: () => {
    if (s.host === null) throw new Error("no request");
    return s.host;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/server-error-log", () => ({ logServerError: s.logServerError }));
vi.mock("@/lib/vipps.server", () => ({
  getVippsMode: () => s.vippsMode,
  createVippsPayment: s.createVippsPayment,
  getVippsPayment: s.getVippsPayment,
  captureVippsPayment: s.captureVippsPayment,
  releaseSupersededPromotionPayment: s.releaseSupersededPromotionPayment,
}));

function next(table: string): Result {
  const r = s.queues[table]?.shift();
  if (!r) throw new Error(`Ingen mock-resultat igjen for ${table}`);
  return { data: null, error: null, ...r };
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "neq", "limit", "order"]) chain[m] = () => chain;
      for (const m of ["insert", "update"]) {
        chain[m] = (values: unknown) => {
          s.ops.push({ table, op: m, values });
          return chain;
        };
      }
      chain.maybeSingle = async () => next(table);
      chain.single = async () => next(table);
      chain.then = (resolve: (v: unknown) => void) => resolve(next(table));
      return chain;
    },
  },
}));

import { createPromotionCheckout, reconcilePromotionPayment } from "./promotions.functions";

const listingId = "11111111-1111-4111-8111-111111111111";
const promotionId = "22222222-2222-4222-8222-222222222222";
const dbError = { code: "XX000", message: "intern db-feil med hemmeligheter" };
const GENERIC = "Noe gikk galt. Prøv igjen senere.";

const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as Error & { status?: number };
  }
  throw new Error("forventet avvisning");
};

const ops = (table: string, op: string) =>
  s.ops.filter((o) => o.table === table && o.op === op).map((o) => o.values);

beforeEach(() => {
  s.host = "kaupet.no";
  s.vippsMode = "production";
  s.queues = {};
  s.ops = [];
  s.context = undefined;
  s.createVippsPayment.mockReset().mockResolvedValue({ redirectUrl: "https://vipps/r" });
  s.getVippsPayment.mockReset();
  s.captureVippsPayment.mockReset().mockResolvedValue(undefined);
  s.logServerError.mockReset().mockResolvedValue(undefined);
  s.releaseSupersededPromotionPayment.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reconcilePromotionPayment: tilstandsvakter", () => {
  const pending = {
    id: promotionId,
    user_id: "user-1",
    status: "pending",
    duration_days: 7,
    price_nok: 10,
    vipps_reference: "ref-1",
    vipps_mode: "test",
    expires_at: null,
  };
  const run = () => reconcilePromotionPayment({ data: { promotion_id: promotionId } });
  beforeEach(() => {
    s.context = { userId: "user-1" };
  });

  it("404 når fremhevingen ikke finnes", async () => {
    s.queues.listing_promotions = [{ data: null }];
    const e = await rejection(run());
    expect(e).toMatchObject({ message: "Fant ikke fremheving", status: 404 });
  });

  it("403 når fremhevingen tilhører en annen bruker, uten Vipps-kall", async () => {
    s.queues.listing_promotions = [{ data: { ...pending, user_id: "annen" } }];
    const e = await rejection(run());
    expect(e).toMatchObject({ message: "Ikke tilgang", status: 403 });
    expect(s.getVippsPayment).not.toHaveBeenCalled();
  });

  it("maskerer databasefeil", async () => {
    s.queues.listing_promotions = [{ error: dbError }];
    const e = await rejection(run());
    expect(e.message).toBe(GENERIC);
  });

  it("returnerer lagret status uten Vipps-kall når den ikke lenger er pending", async () => {
    s.queues.listing_promotions = [{ data: { ...pending, status: "active", expires_at: "t" } }];
    await expect(run()).resolves.toEqual({ status: "active", expires_at: "t" });
    expect(s.getVippsPayment).not.toHaveBeenCalled();
  });

  it("failed + CAPTURED i Vipps: sjekker Vipps og aktiverer (betalt, ikke aktivert)", async () => {
    s.queues.listing_promotions = [
      { data: { ...pending, status: "failed" } },
      { data: [] },
      { data: { status: "active", expires_at: "x" } },
    ];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED" });
    await expect(run()).resolves.toEqual({ status: "active", expires_at: "x" });
    expect(s.getVippsPayment).toHaveBeenCalled();
    expect(ops("listing_promotions", "update")).toEqual([
      expect.objectContaining({ status: "active" }),
    ]);
  });

  it("failed + CAPTURED + annen aktiv fremheving: refunderer og returnerer refunded", async () => {
    s.queues.listing_promotions = [
      { data: { ...pending, status: "failed", listing_id: listingId } },
      { data: [{ id: "annen" }] },
    ];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED" });
    await expect(run()).resolves.toEqual({ status: "refunded", expires_at: null });
    expect(ops("listing_promotions", "update")).toEqual([]);
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(s.releaseSupersededPromotionPayment).toHaveBeenCalledWith(
      expect.objectContaining({ promotionId, captured: true }),
    );
    expect(s.logServerError).toHaveBeenCalledWith(
      "reconcilePromotionPayment.paidSupersededPromotion",
      "CAPTURED",
      { promotion_id: promotionId },
    );
  });

  it("failed + AUTHORIZED + annen aktiv fremheving: kansellerer, returnerer failed", async () => {
    s.queues.listing_promotions = [
      { data: { ...pending, status: "failed", listing_id: listingId } },
      { data: [{ id: "annen" }] },
    ];
    s.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED" });
    await expect(run()).resolves.toEqual({ status: "failed", expires_at: null });
    expect(s.captureVippsPayment).not.toHaveBeenCalled();
    expect(s.releaseSupersededPromotionPayment).toHaveBeenCalledWith(
      expect.objectContaining({ promotionId, captured: false }),
    );
  });

  it("superseded + release feiler: returnerer failed og logger", async () => {
    s.queues.listing_promotions = [
      { data: { ...pending, status: "failed", listing_id: listingId } },
      { data: [{ id: "annen" }] },
    ];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED" });
    s.releaseSupersededPromotionPayment.mockRejectedValue(new Error("vipps nede"));
    await expect(run()).resolves.toEqual({ status: "failed", expires_at: null });
    expect(s.logServerError).toHaveBeenCalledWith(
      "reconcilePromotionPayment.releaseSupersededPayment",
      expect.any(Error),
      { promotion_id: promotionId },
    );
  });

  it("23505 ved aktivering (kappløp): refunderer, returnerer refunded og logger", async () => {
    s.queues.listing_promotions = [
      { data: { ...pending, status: "failed", listing_id: listingId } },
      { data: [] },
      { error: { code: "23505" } },
    ];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED" });
    await expect(run()).resolves.toEqual({ status: "refunded", expires_at: null });
    expect(s.releaseSupersededPromotionPayment).toHaveBeenCalledWith(
      expect.objectContaining({ promotionId, captured: true }),
    );
    expect(s.logServerError).toHaveBeenCalledWith(
      "reconcilePromotionPayment.paidSupersededPromotion",
      { code: "23505" },
      { promotion_id: promotionId },
    );
  });

  it("returnerer pending uten Vipps-kall når Vipps-referanse mangler", async () => {
    s.queues.listing_promotions = [{ data: { ...pending, vipps_reference: null } }];
    await expect(run()).resolves.toEqual({ status: "pending", expires_at: null });
    expect(s.getVippsPayment).not.toHaveBeenCalled();
  });

  it("CREATED: forblir pending uten oppdatering", async () => {
    s.queues.listing_promotions = [{ data: pending }];
    s.getVippsPayment.mockResolvedValue({ state: "CREATED" });
    await expect(run()).resolves.toEqual({ status: "pending", expires_at: null });
    expect(ops("listing_promotions", "update")).toEqual([]);
  });

  it("Vipps-feil ved statusoppslag: 503 med kontrollert melding, logger og oppdaterer ikke", async () => {
    s.queues.listing_promotions = [{ data: pending }];
    s.getVippsPayment.mockRejectedValue(new Error("vipps intern feil"));
    const e = await rejection(run());
    expect(e.status).toBe(503);
    expect(e.message).toBe("Kunne ikke hente betalingsstatus fra Vipps. Prøv igjen om litt.");
    expect(s.logServerError).toHaveBeenCalledWith(
      "reconcilePromotionPayment.getPayment",
      expect.anything(),
      { promotion_id: promotionId },
    );
    expect(ops("listing_promotions", "update")).toEqual([]);
  });

  it("feilet capture: kaster brukervennlig feil, logger og aktiverer ikke", async () => {
    s.queues.listing_promotions = [{ data: pending }];
    s.getVippsPayment.mockResolvedValue({ state: "AUTHORIZED" });
    s.captureVippsPayment.mockRejectedValue(new Error("vipps 500"));
    const e = await rejection(run());
    expect(e.message).toBe("Betalingen er autorisert, men ikke belastet ennå. Prøv igjen.");
    expect(e.cause).toMatchObject({ message: "vipps 500" });
    expect(s.logServerError).toHaveBeenCalledWith(
      "reconcilePromotionPayment.capture",
      expect.anything(),
      { promotion_id: promotionId },
    );
    expect(ops("listing_promotions", "update")).toEqual([]);
  });

  it("feil ved aktivering maskeres", async () => {
    s.queues.listing_promotions = [{ data: pending }, { error: dbError }];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED" });
    expect((await rejection(run())).message).toBe(GENERIC);
  });

  it("404 når raden forsvinner mellom aktivering og re-lesing", async () => {
    s.queues.listing_promotions = [{ data: pending }, { data: null }, { data: null }];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED" });
    expect(await rejection(run())).toMatchObject({ message: "Fant ikke fremheving", status: 404 });
  });

  it("feil ved re-lesing maskeres", async () => {
    s.queues.listing_promotions = [{ data: pending }, { data: null }, { error: dbError }];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED" });
    expect((await rejection(run())).message).toBe(GENERIC);
  });

  it("aktiverer med utløp fra duration_days og lagrer psp-referanse", async () => {
    s.queues.listing_promotions = [
      { data: pending },
      { data: { status: "active", expires_at: "x" } },
    ];
    s.getVippsPayment.mockResolvedValue({ state: "CAPTURED", pspReference: "psp-1" });
    await run();
    const [values] = ops("listing_promotions", "update") as Record<string, string>[];
    expect(values).toMatchObject({ status: "active", vipps_psp_reference: "psp-1" });
    expect((Date.parse(values.expires_at) - Date.parse(values.starts_at)) / 86_400_000).toBe(7);
  });

  it("feil ved failed-markering logges, men resultatet er fortsatt failed", async () => {
    s.queues.listing_promotions = [{ data: pending }, { error: dbError }];
    s.getVippsPayment.mockResolvedValue({ state: "CANCELLED" });
    await expect(run()).resolves.toEqual({ status: "failed", expires_at: null });
    expect(s.logServerError).toHaveBeenCalledWith(
      "reconcilePromotionPayment.markFailed",
      dbError,
      expect.anything(),
    );
  });

  it("feil ved refunded-markering logges, men resultatet er fortsatt refunded", async () => {
    s.queues.listing_promotions = [{ data: pending }, { error: dbError }];
    s.getVippsPayment.mockResolvedValue({ state: "REFUNDED" });
    await expect(run()).resolves.toEqual({ status: "refunded", expires_at: null });
    expect(s.logServerError).toHaveBeenCalledWith(
      "reconcilePromotionPayment.markRefunded",
      dbError,
      expect.anything(),
    );
  });

  it("bruker lagret vipps_mode og null-vert når request-vert ikke kan leses", async () => {
    s.host = null;
    s.queues.listing_promotions = [{ data: pending }];
    s.getVippsPayment.mockResolvedValue({ state: "CREATED" });
    await run();
    expect(s.getVippsPayment).toHaveBeenCalledWith("ref-1", null, "test");
  });
});

describe("createPromotionCheckout: tilstandsvakter", () => {
  const listing = { id: listingId, seller_id: "user-1", status: "active", title: "Sykkel" };
  const run = (days = 7) =>
    createPromotionCheckout({ data: { listing_id: listingId, duration_days: days } });
  let listingResult: Result;

  beforeEach(() => {
    listingResult = { data: listing };
    s.context = {
      userId: "user-1",
      supabase: { from: () => ({ select: () => chainOf(() => listingResult) }) },
    };
    s.queues.promotion_pricing = [{ data: { price_nok: 49 } }];
    s.queues.listing_promotions = [{ data: null }, { data: { id: promotionId } }];
  });

  function chainOf(get: () => Result) {
    const c: Record<string, unknown> = {};
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: null, error: null, ...get() });
    return c;
  }

  it("404 når annonsen ikke finnes", async () => {
    listingResult = { data: null };
    expect(await rejection(run())).toMatchObject({ message: "Annonsen finnes ikke", status: 404 });
  });

  it("maskerer databasefeil ved annonseoppslag", async () => {
    listingResult = { error: dbError };
    expect((await rejection(run())).message).toBe(GENERIC);
  });

  it("403 når brukeren ikke eier annonsen", async () => {
    listingResult = { data: { ...listing, seller_id: "annen" } };
    expect(await rejection(run())).toMatchObject({
      message: "Du eier ikke denne annonsen",
      status: 403,
    });
    expect(s.createVippsPayment).not.toHaveBeenCalled();
  });

  it("409 når annonsen ikke er aktiv", async () => {
    listingResult = { data: { ...listing, status: "sold" } };
    expect(await rejection(run())).toMatchObject({
      message: "Annonsen må være aktiv for å fremheves",
      status: 409,
    });
  });

  it("400 ved ukjent pakkevarighet, uten å opprette rad", async () => {
    s.queues.promotion_pricing = [{ data: null }];
    expect(await rejection(run())).toMatchObject({ message: "Ugyldig pakkevarighet", status: 400 });
    expect(ops("listing_promotions", "insert")).toEqual([]);
  });

  it("maskerer databasefeil ved prisoppslag", async () => {
    s.queues.promotion_pricing = [{ error: dbError }];
    expect((await rejection(run())).message).toBe(GENERIC);
  });

  it("409 når annonsen allerede har aktiv, ventende eller gitt fremheving", async () => {
    s.queues.listing_promotions = [{ data: { id: "x", status: "active" } }];
    expect(await rejection(run())).toMatchObject({
      message: "Denne annonsen har allerede en aktiv eller ventende fremheving",
      status: 409,
    });
    expect(ops("listing_promotions", "insert")).toEqual([]);
    expect(s.createVippsPayment).not.toHaveBeenCalled();
  });

  it("oppretter pending rad med pris fra databasen og modus fastlåst, og sender returnUrl/idempotency-key", async () => {
    await run();
    expect(ops("listing_promotions", "insert")[0]).toMatchObject({
      listing_id: listingId,
      user_id: "user-1",
      duration_days: 7,
      price_nok: 49,
      status: "pending",
      vipps_mode: "production",
    });
    expect(s.createVippsPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountNok: 49,
        returnUrl: `https://kaupet.no/bekrefter/${promotionId}`,
        idempotencyKey: promotionId,
        host: "kaupet.no",
      }),
    );
  });

  it("lagrer psp-referanse fra Vipps og logger (uten å feile) når lagringen svikter", async () => {
    s.createVippsPayment.mockResolvedValue({ redirectUrl: "u", pspReference: "psp-1" });
    s.queues.listing_promotions.push({ error: dbError });
    await expect(run()).resolves.toEqual({ promotion_id: promotionId, redirect_url: "u" });
    expect(ops("listing_promotions", "update")).toEqual([{ vipps_psp_reference: "psp-1" }]);
    expect(s.logServerError).toHaveBeenCalledWith(
      "createPromotionCheckout.updatePspReference",
      dbError,
      { promotion_id: promotionId },
    );
  });

  it("maskerer feil ved innsetting", async () => {
    s.queues.listing_promotions = [{ data: null }, { error: dbError }];
    expect((await rejection(run())).message).toBe(GENERIC);
    expect(s.createVippsPayment).not.toHaveBeenCalled();
  });

  it("markerer raden som failed og kaster videre når Vipps feiler", async () => {
    s.createVippsPayment.mockRejectedValue(new Error("Vipps create-payment feilet: 500"));
    s.queues.listing_promotions.push({ data: null });
    await expect(run()).rejects.toThrow("Vipps create-payment feilet: 500");
    expect(ops("listing_promotions", "update")).toEqual([{ status: "failed" }]);
  });

  it("logger når failed-markering også feiler, men kaster den opprinnelige Vipps-feilen", async () => {
    s.createVippsPayment.mockRejectedValue(new Error("Vipps nede"));
    s.queues.listing_promotions.push({ error: dbError });
    await expect(run()).rejects.toThrow("Vipps nede");
    expect(s.logServerError).toHaveBeenCalledWith("createPromotionCheckout.markFailed", dbError, {
      promotion_id: promotionId,
    });
  });

  it("faller tilbake til PUBLIC_SITE_URL i returnUrl når vert mangler", async () => {
    s.host = null;
    vi.stubEnv("PUBLIC_SITE_URL", "https://site.example");
    await run();
    expect(s.createVippsPayment).toHaveBeenCalledWith(
      expect.objectContaining({ returnUrl: `https://site.example/bekrefter/${promotionId}` }),
    );
    vi.unstubAllEnvs();
  });
});
