import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  updates: [] as { values: unknown; inFilters: unknown[] }[],
  updateError: null as unknown,
  result: { data: null, error: null } as { data: { secret: string } | null; error: unknown },
  throws: false,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      update: (values: unknown) => {
        const call = { values, inFilters: [] as unknown[] };
        db.updates.push(call);
        const chain = {
          eq: () => chain,
          in: (...a: unknown[]) => (call.inFilters.push(a), chain),
          then: (resolve: (v: unknown) => void) => resolve({ error: db.updateError }),
        };
        return chain;
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (db.throws) throw new Error("db nede");
            return db.result;
          },
        }),
      }),
    }),
  },
}));

const ENV_KEYS = [
  "VIPPS_ENVIRONMENT",
  "VIPPS_CLIENT_ID",
  "VIPPS_CLIENT_SECRET",
  "VIPPS_SUBSCRIPTION_KEY",
  "VIPPS_MSN",
  "VIPPS_WEBHOOK_SECRET",
  "VIPPS_TEST_CLIENT_ID",
  "VIPPS_TEST_CLIENT_SECRET",
  "VIPPS_TEST_SUBSCRIPTION_KEY",
  "VIPPS_TEST_MSN",
  "VIPPS_TEST_WEBHOOK_SECRET",
] as const;
const saved: Record<string, string | undefined> = {};
const fetchMock = vi.fn();

const isTokenCall = (url: unknown) => String(url).endsWith("/accesstoken/get");

function tokenResponse(expiresOnSec = Math.floor(Date.now() / 1000) + 3600) {
  return new Response(JSON.stringify({ access_token: "tok-1", expires_on: String(expiresOnSec) }));
}

/** Svarer token-kallet først, deretter gitt respons på selve API-kallet. */
function mockApi(apiResponse: Response | Error) {
  fetchMock.mockImplementation(async (url: string) => {
    if (isTokenCall(url)) return tokenResponse();
    if (apiResponse instanceof Error) throw apiResponse;
    return apiResponse.clone();
  });
}

const apiCalls = () => fetchMock.mock.calls.filter(([url]) => !isTokenCall(url));
const tokenCalls = () => fetchMock.mock.calls.filter(([url]) => isTokenCall(url));

async function load() {
  vi.resetModules();
  return await import("./vipps.server");
}

beforeEach(() => {
  db.updateError = null;
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.VIPPS_CLIENT_ID = "cid";
  process.env.VIPPS_CLIENT_SECRET = "csecret";
  process.env.VIPPS_SUBSCRIPTION_KEY = "subkey";
  process.env.VIPPS_MSN = "123";
  process.env.VIPPS_TEST_CLIENT_ID = "tcid";
  process.env.VIPPS_TEST_CLIENT_SECRET = "tcsecret";
  process.env.VIPPS_TEST_SUBSCRIPTION_KEY = "tsubkey";
  process.env.VIPPS_TEST_MSN = "999";
  db.result = { data: null, error: null };
  db.throws = false;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("assertVippsConfigured", () => {
  it("lister alle manglende nøkler med riktig prefiks", async () => {
    const { assertVippsConfigured } = await load();
    delete process.env.VIPPS_CLIENT_ID;
    delete process.env.VIPPS_MSN;
    expect(() => assertVippsConfigured("kaupet.no")).toThrow(
      /Vipps \(production\).*VIPPS_CLIENT_ID, VIPPS_MSN/,
    );
    delete process.env.VIPPS_TEST_SUBSCRIPTION_KEY;
    expect(() => assertVippsConfigured("test.kaupet.no")).toThrow(
      /Vipps \(test\).*VIPPS_TEST_SUBSCRIPTION_KEY/,
    );
  });
});

describe("createVippsPayment", () => {
  const input = {
    reference: "ref-1",
    amountNok: 49.5,
    description: "Fremheving",
    returnUrl: "https://kaupet.no/bekrefter/1",
    idempotencyKey: "promo-1",
    host: "kaupet.no",
  };

  it("sender beløp i øre, idempotency-key og auth-headere mot produksjons-API", async () => {
    mockApi(
      new Response(
        JSON.stringify({ redirectUrl: "https://vipps/r", reference: "ref-1", pspReference: "psp" }),
      ),
    );
    const { createVippsPayment } = await load();
    await expect(createVippsPayment(input)).resolves.toEqual({
      reference: "ref-1",
      redirectUrl: "https://vipps/r",
      pspReference: "psp",
    });
    const [url, init] = apiCalls()[0];
    expect(url).toBe("https://api.vipps.no/epayment/v1/payments");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok-1",
      "Idempotency-Key": "promo-1",
      "Merchant-Serial-Number": "123",
      "Ocp-Apim-Subscription-Key": "subkey",
    });
    expect(JSON.parse(init.body)).toMatchObject({
      amount: { currency: "NOK", value: 4950 },
      reference: "ref-1",
      returnUrl: input.returnUrl,
    });
  });

  it("bruker test-API og test-nøkler på testvert", async () => {
    mockApi(new Response(JSON.stringify({ redirectUrl: "u", reference: "ref-1" })));
    const { createVippsPayment } = await load();
    await createVippsPayment({ ...input, host: "test.kaupet.no" });
    const [url, init] = apiCalls()[0];
    expect(url).toBe("https://apitest.vipps.no/epayment/v1/payments");
    expect(init.headers["Merchant-Serial-Number"]).toBe("999");
  });

  it("kaster med status og tekst når Vipps svarer feil", async () => {
    mockApi(new Response("bad request", { status: 400 }));
    const { createVippsPayment } = await load();
    await expect(createVippsPayment(input)).rejects.toThrow(
      "Vipps create-payment feilet: 400 bad request",
    );
  });

  it("feiler før noe nettverkskall når Vipps ikke er konfigurert", async () => {
    delete process.env.VIPPS_CLIENT_ID;
    const { createVippsPayment } = await load();
    await expect(createVippsPayment(input)).rejects.toThrow(/ikke konfigurert/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("access token", () => {
  it("gjenbruker token fra cache og henter nytt når det snart utløper", async () => {
    mockApi(new Response(JSON.stringify({ state: "CREATED" })));
    const { getVippsPayment } = await load();
    await getVippsPayment("r", "kaupet.no");
    await getVippsPayment("r", "kaupet.no");
    expect(tokenCalls()).toHaveLength(1);

    // Utløper innen 30 s => må hentes på nytt.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3600_000 - 10_000);
    await getVippsPayment("r", "kaupet.no");
    expect(tokenCalls()).toHaveLength(2);
  });

  it("kaster når token-henting feiler", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const { getVippsPayment } = await load();
    await expect(getVippsPayment("r", "kaupet.no")).rejects.toThrow(
      "Vipps access token feilet: 401 unauthorized",
    );
  });

  it("faller tilbake til 50 minutters levetid når expires_on er ugyldig", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isTokenCall(url)
        ? new Response(JSON.stringify({ access_token: "t", expires_on: "nonsense" }))
        : new Response(JSON.stringify({ state: "CREATED" })),
    );
    const { getVippsPayment } = await load();
    await getVippsPayment("r", "kaupet.no");
    await getVippsPayment("r", "kaupet.no");
    expect(tokenCalls()).toHaveLength(1);
  });
});

describe("getVippsPayment", () => {
  it("returnerer tilstand og bruker eksplisitt modus foran vert", async () => {
    mockApi(new Response(JSON.stringify({ state: "AUTHORIZED", pspReference: "psp" })));
    const { getVippsPayment } = await load();
    await expect(getVippsPayment("ref-1", "kaupet.no", "test")).resolves.toEqual({
      state: "AUTHORIZED",
      pspReference: "psp",
    });
    expect(apiCalls()[0][0]).toBe("https://apitest.vipps.no/epayment/v1/payments/ref-1");
  });

  it("kaster ved feilrespons", async () => {
    mockApi(new Response("nope", { status: 404 }));
    const { getVippsPayment } = await load();
    await expect(getVippsPayment("r", "kaupet.no")).rejects.toThrow(
      "Vipps get-payment feilet: 404 nope",
    );
  });
});

describe("cancelVippsPayment", () => {
  it("poster tom body med gitt idempotency-key", async () => {
    mockApi(new Response("{}"));
    const { cancelVippsPayment } = await load();
    await cancelVippsPayment("ref-1", "cancel-1", "kaupet.no");
    const [url, init] = apiCalls()[0];
    expect(url).toBe("https://api.vipps.no/epayment/v1/payments/ref-1/cancel");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("cancel-1");
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("kaster ved feilrespons", async () => {
    mockApi(new Response("conflict", { status: 409 }));
    const { cancelVippsPayment } = await load();
    await expect(cancelVippsPayment("ref-1", "k", "kaupet.no")).rejects.toThrow(
      "Vipps cancel feilet: 409 conflict",
    );
  });
});

describe("releaseSupersededPromotionPayment", () => {
  const input = {
    promotionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    reference: "ref-1",
    amountNok: 10,
    host: "kaupet.no",
    mode: "production" as const,
  };

  it("belastet: refunderer med stabil nøkkel og setter raden refunded", async () => {
    mockApi(new Response("{}"));
    db.updates = [];
    const { releaseSupersededPromotionPayment } = await load();
    await releaseSupersededPromotionPayment({ ...input, captured: true });
    const [url, init] = apiCalls()[0];
    expect(url).toBe("https://api.vipps.no/epayment/v1/payments/ref-1/refund");
    expect(init.headers["Idempotency-Key"]).toBe("r-aaaaaaaabbbb4ccc8dddeeeeeeeeeeee");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].values).toMatchObject({ status: "refunded" });
    expect(db.updates[0].inFilters).toEqual([["status", ["pending", "failed"]]]);
  });

  it("belastet: kaster når statusoppdateringen feiler", async () => {
    mockApi(new Response("{}"));
    db.updateError = { message: "db nede" };
    const { releaseSupersededPromotionPayment } = await load();
    await expect(releaseSupersededPromotionPayment({ ...input, captured: true })).rejects.toEqual({
      message: "db nede",
    });
  });

  it("bare autorisert: kansellerer, ingen refusjon og ingen oppdatering", async () => {
    mockApi(new Response("{}"));
    db.updates = [];
    const { releaseSupersededPromotionPayment } = await load();
    await releaseSupersededPromotionPayment({ ...input, captured: false });
    const [url, init] = apiCalls()[0];
    expect(url).toBe("https://api.vipps.no/epayment/v1/payments/ref-1/cancel");
    expect(init.headers["Idempotency-Key"]).toBe(`cancel-${input.promotionId}`);
    expect(apiCalls()).toHaveLength(1);
    expect(db.updates).toEqual([]);
  });
});

describe.each([
  ["captureVippsPayment", "capture", "Vipps capture feilet: 409 conflict"],
  ["refundVippsPayment", "refund", "Vipps refund feilet: 409 conflict"],
] as const)("%s", (fn, path, errorMessage) => {
  it("poster beløp i øre med gitt idempotency-key", async () => {
    mockApi(new Response("{}"));
    const mod = await load();
    await mod[fn]("ref-1", 12.34, "key-1", "kaupet.no");
    const [url, init] = apiCalls()[0];
    expect(url).toBe(`https://api.vipps.no/epayment/v1/payments/ref-1/${path}`);
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("key-1");
    expect(JSON.parse(init.body)).toEqual({ modificationAmount: { currency: "NOK", value: 1234 } });
  });

  it("respekterer eksplisitt modus", async () => {
    mockApi(new Response("{}"));
    const mod = await load();
    await mod[fn]("ref-1", 10, "k", "kaupet.no", "test");
    expect(apiCalls()[0][0]).toContain("https://apitest.vipps.no/");
  });

  it("kaster ved feilrespons og prøver ikke på nytt av seg selv", async () => {
    mockApi(new Response("conflict", { status: 409 }));
    const mod = await load();
    await expect(mod[fn]("ref-1", 10, "k", "kaupet.no")).rejects.toThrow(errorMessage);
    expect(apiCalls()).toHaveLength(1);
  });

  it("propagerer nettverksfeil", async () => {
    mockApi(new Error("network down"));
    const mod = await load();
    await expect(mod[fn]("ref-1", 10, "k", "kaupet.no")).rejects.toThrow("network down");
  });

  it("feiler uten nettverkskall når Vipps ikke er konfigurert", async () => {
    delete process.env.VIPPS_MSN;
    const mod = await load();
    await expect(mod[fn]("ref-1", 10, "k", "kaupet.no")).rejects.toThrow(/VIPPS_MSN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getVippsWebhookSecret", () => {
  it("foretrekker hemmelighet fra databasen", async () => {
    db.result = { data: { secret: "db-secret" }, error: null };
    process.env.VIPPS_WEBHOOK_SECRET = "env-secret";
    const { getVippsWebhookSecret } = await load();
    await expect(getVippsWebhookSecret("kaupet.no")).resolves.toBe("db-secret");
  });

  it("faller tilbake til miljøvariabel for riktig modus når databasen ikke har rad", async () => {
    process.env.VIPPS_WEBHOOK_SECRET = "env-secret";
    process.env.VIPPS_TEST_WEBHOOK_SECRET = "env-test-secret";
    const { getVippsWebhookSecret } = await load();
    await expect(getVippsWebhookSecret("kaupet.no")).resolves.toBe("env-secret");
    await expect(getVippsWebhookSecret("test.kaupet.no")).resolves.toBe("env-test-secret");
  });

  it("faller tilbake til miljøvariabel og logger når databasen kaster", async () => {
    db.throws = true;
    process.env.VIPPS_WEBHOOK_SECRET = "env-secret";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getVippsWebhookSecret } = await load();
    await expect(getVippsWebhookSecret("kaupet.no")).resolves.toBe("env-secret");
    expect(err).toHaveBeenCalled();
  });

  it("gir tom streng (som webhooken avviser) når ingen hemmelighet finnes", async () => {
    const { getVippsWebhookSecret } = await load();
    await expect(getVippsWebhookSecret("kaupet.no")).resolves.toBe("");
  });
});
