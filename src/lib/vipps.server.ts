/**
 * Vipps ePayment API helpers (server-only).
 * https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
 */

type TokenCache = { token: string; expires_at: number } | null;
let tokenCache: TokenCache = null;

function env() {
  const environment = process.env.VIPPS_ENVIRONMENT ?? "test";
  const baseUrl =
    environment === "production" ? "https://api.vipps.no" : "https://apitest.vipps.no";
  return {
    baseUrl,
    clientId: process.env.VIPPS_CLIENT_ID ?? "",
    clientSecret: process.env.VIPPS_CLIENT_SECRET ?? "",
    subscriptionKey: process.env.VIPPS_SUBSCRIPTION_KEY ?? "",
    msn: process.env.VIPPS_MSN ?? "",
    webhookSecret: process.env.VIPPS_WEBHOOK_SECRET ?? "",
    environment,
  };
}

export function assertVippsConfigured() {
  const e = env();
  const missing: string[] = [];
  if (!e.clientId) missing.push("VIPPS_CLIENT_ID");
  if (!e.clientSecret) missing.push("VIPPS_CLIENT_SECRET");
  if (!e.subscriptionKey) missing.push("VIPPS_SUBSCRIPTION_KEY");
  if (!e.msn) missing.push("VIPPS_MSN");
  if (missing.length) {
    throw new Error(
      `Vipps er ikke konfigurert. Mangler: ${missing.join(", ")}. Be administrator legge inn nøklene.`,
    );
  }
}

async function getAccessToken(): Promise<string> {
  const e = env();
  const now = Date.now();
  if (tokenCache && tokenCache.expires_at > now + 30_000) return tokenCache.token;

  const res = await fetch(`${e.baseUrl}/accesstoken/get`, {
    method: "POST",
    headers: {
      "client_id": e.clientId,
      "client_secret": e.clientSecret,
      "Ocp-Apim-Subscription-Key": e.subscriptionKey,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps access token feilet: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_on: string };
  const expiresAt = Number(json.expires_on) * 1000;
  tokenCache = {
    token: json.access_token,
    expires_at: Number.isFinite(expiresAt) ? expiresAt : now + 50 * 60 * 1000,
  };
  return tokenCache.token;
}

async function vippsHeaders(extra: Record<string, string> = {}) {
  const e = env();
  const token = await getAccessToken();
  return {
    "Authorization": `Bearer ${token}`,
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
};

export type CreatePaymentResult = {
  reference: string;
  redirectUrl: string;
  pspReference?: string;
};

export async function createVippsPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  assertVippsConfigured();
  const e = env();
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
    headers: await vippsHeaders({ "Idempotency-Key": input.idempotencyKey }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps create-payment feilet: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { redirectUrl: string; reference: string; pspReference?: string };
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

export async function getVippsPayment(reference: string): Promise<{
  state: VippsPaymentStatus;
  pspReference?: string;
  amount?: { value: number; currency: string };
}> {
  assertVippsConfigured();
  const e = env();
  const res = await fetch(`${e.baseUrl}/epayment/v1/payments/${reference}`, {
    headers: await vippsHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps get-payment feilet: ${res.status} ${text}`);
  }
  return (await res.json()) as { state: VippsPaymentStatus; pspReference?: string; amount?: { value: number; currency: string } };
}

export async function captureVippsPayment(reference: string, amountNok: number, idempotencyKey: string) {
  assertVippsConfigured();
  const e = env();
  const res = await fetch(`${e.baseUrl}/epayment/v1/payments/${reference}/capture`, {
    method: "POST",
    headers: await vippsHeaders({ "Idempotency-Key": idempotencyKey }),
    body: JSON.stringify({
      modificationAmount: { currency: "NOK", value: Math.round(amountNok * 100) },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps capture feilet: ${res.status} ${text}`);
  }
}

export async function refundVippsPayment(reference: string, amountNok: number, idempotencyKey: string) {
  assertVippsConfigured();
  const e = env();
  const res = await fetch(`${e.baseUrl}/epayment/v1/payments/${reference}/refund`, {
    method: "POST",
    headers: await vippsHeaders({ "Idempotency-Key": idempotencyKey }),
    body: JSON.stringify({
      modificationAmount: { currency: "NOK", value: Math.round(amountNok * 100) },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps refund feilet: ${res.status} ${text}`);
  }
}

export function getVippsWebhookSecret(): string {
  return env().webhookSecret;
}
