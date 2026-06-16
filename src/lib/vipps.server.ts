/**
 * Vipps ePayment API helpers (server-only).
 * Host-aware: requests on test.kaupet.no use Vipps test API + VIPPS_TEST_* secrets;
 * everything else uses production API + VIPPS_* secrets.
 * https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
 */
import { isTestHost } from "./env";
import { getRequestIsTest } from "./env.server";

type VippsEnv = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  msn: string;
  webhookSecret: string;
  mode: "test" | "production";
};

type TokenCache = { token: string; expires_at: number } | null;
const tokenCache: { test: TokenCache; production: TokenCache } = {
  test: null,
  production: null,
};

function hostAwareEnv(host?: string | null): VippsEnv {
  // Explicit override (local dev): VIPPS_ENVIRONMENT=test|production wins.
  const override = process.env.VIPPS_ENVIRONMENT;
  const useTest =
    override === "test" ||
    (override !== "production" && (isTestHost(host) || getRequestIsTest()));

  if (useTest) {
    return {
      baseUrl: "https://apitest.vipps.no",
      clientId: process.env.VIPPS_TEST_CLIENT_ID ?? "",
      clientSecret: process.env.VIPPS_TEST_CLIENT_SECRET ?? "",
      subscriptionKey: process.env.VIPPS_TEST_SUBSCRIPTION_KEY ?? "",
      msn: process.env.VIPPS_TEST_MSN ?? "",
      webhookSecret: process.env.VIPPS_TEST_WEBHOOK_SECRET ?? "",
      mode: "test",
    };
  }
  return {
    baseUrl: "https://api.vipps.no",
    clientId: process.env.VIPPS_CLIENT_ID ?? "",
    clientSecret: process.env.VIPPS_CLIENT_SECRET ?? "",
    subscriptionKey: process.env.VIPPS_SUBSCRIPTION_KEY ?? "",
    msn: process.env.VIPPS_MSN ?? "",
    webhookSecret: process.env.VIPPS_WEBHOOK_SECRET ?? "",
    mode: "production",
  };
}

export function assertVippsConfigured(host?: string | null) {
  const e = hostAwareEnv(host);
  const prefix = e.mode === "test" ? "VIPPS_TEST_" : "VIPPS_";
  const missing: string[] = [];
  if (!e.clientId) missing.push(`${prefix}CLIENT_ID`);
  if (!e.clientSecret) missing.push(`${prefix}CLIENT_SECRET`);
  if (!e.subscriptionKey) missing.push(`${prefix}SUBSCRIPTION_KEY`);
  if (!e.msn) missing.push(`${prefix}MSN`);
  if (missing.length) {
    throw new Error(
      `Vipps (${e.mode}) er ikke konfigurert. Mangler: ${missing.join(", ")}. Be administrator legge inn nøklene.`,
    );
  }
}

async function getAccessToken(e: VippsEnv): Promise<string> {
  const now = Date.now();
  const cached = tokenCache[e.mode];
  if (cached && cached.expires_at > now + 30_000) return cached.token;

  const res = await fetch(`${e.baseUrl}/accesstoken/get`, {
    method: "POST",
    headers: {
      client_id: e.clientId,
      client_secret: e.clientSecret,
      "Ocp-Apim-Subscription-Key": e.subscriptionKey,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps access token feilet: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_on: string };
  const expiresAt = Number(json.expires_on) * 1000;
  tokenCache[e.mode] = {
    token: json.access_token,
    expires_at: Number.isFinite(expiresAt) ? expiresAt : now + 50 * 60 * 1000,
  };
  return json.access_token;
}

async function vippsHeaders(e: VippsEnv, extra: Record<string, string> = {}) {
  const token = await getAccessToken(e);
  return {
    Authorization: `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": e.subscriptionKey,
    "Merchant-Serial-Number": e.msn,
    "Vipps-System-Name": "kaupet.no",
    "Vipps-System-Version": "1.0",
    "Vipps-System-Plugin-Name": "kaupet-promotions",
    "Vipps-System-Plugin-Version": "1.0",
    "Content-Type": "application/json",
    ...extra,
  };
}

export type CreatePaymentInput = {
  reference: string;
  amountNok: number;
  description: string;
  returnUrl: string;
  idempotencyKey: string;
  host?: string | null;
};

export type CreatePaymentResult = {
  reference: string;
  redirectUrl: string;
  pspReference?: string;
};

export async function createVippsPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  assertVippsConfigured(input.host);
  const e = hostAwareEnv(input.host);
  const body = {
    amount: { currency: "NOK", value: Math.round(input.amountNok * 100) },
    paymentMethod: { type: "WALLET" },
    reference: input.reference,
    returnUrl: input.returnUrl,
    userFlow: "WEB_REDIRECT",
    paymentDescription: input.description,
    customer: {},
  };
  const res = await fetch(`${e.baseUrl}/epayment/v1/payments`, {
    method: "POST",
    headers: await vippsHeaders(e, { "Idempotency-Key": input.idempotencyKey }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps create-payment feilet: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    redirectUrl: string;
    reference: string;
    pspReference?: string;
  };
  return {
    reference: json.reference,
    redirectUrl: json.redirectUrl,
    pspReference: json.pspReference,
  };
}

export type VippsPaymentStatus =
  | "CREATED"
  | "AUTHORIZED"
  | "TERMINATED"
  | "EXPIRED"
  | "ABORTED"
  | "CANCELLED"
  | "FAILED"
  | "CAPTURED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export async function getVippsPayment(
  reference: string,
  host?: string | null,
): Promise<{
  state: VippsPaymentStatus;
  pspReference?: string;
  amount?: { value: number; currency: string };
}> {
  assertVippsConfigured(host);
  const e = hostAwareEnv(host);
  const res = await fetch(`${e.baseUrl}/epayment/v1/payments/${reference}`, {
    headers: await vippsHeaders(e),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps get-payment feilet: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    state: VippsPaymentStatus;
    pspReference?: string;
    amount?: { value: number; currency: string };
  };
}

export async function captureVippsPayment(
  reference: string,
  amountNok: number,
  idempotencyKey: string,
  host?: string | null,
) {
  assertVippsConfigured(host);
  const e = hostAwareEnv(host);
  const res = await fetch(`${e.baseUrl}/epayment/v1/payments/${reference}/capture`, {
    method: "POST",
    headers: await vippsHeaders(e, { "Idempotency-Key": idempotencyKey }),
    body: JSON.stringify({
      modificationAmount: { currency: "NOK", value: Math.round(amountNok * 100) },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps capture feilet: ${res.status} ${text}`);
  }
}

export async function refundVippsPayment(
  reference: string,
  amountNok: number,
  idempotencyKey: string,
  host?: string | null,
) {
  assertVippsConfigured(host);
  const e = hostAwareEnv(host);
  const res = await fetch(`${e.baseUrl}/epayment/v1/payments/${reference}/refund`, {
    method: "POST",
    headers: await vippsHeaders(e, { "Idempotency-Key": idempotencyKey }),
    body: JSON.stringify({
      modificationAmount: { currency: "NOK", value: Math.round(amountNok * 100) },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps refund feilet: ${res.status} ${text}`);
  }
}

export function getVippsWebhookSecret(host?: string | null): string {
  return hostAwareEnv(host).webhookSecret;
}
