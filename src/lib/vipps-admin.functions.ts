import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Vipps webhook registration (admin-only).
 *
 * Vipps genererer webhook-secret når man registrerer en webhook via deres API.
 * Kjør denne én gang per miljø, kopier `secret` ut og lagre som
 * VIPPS_TEST_WEBHOOK_SECRET (test) eller VIPPS_WEBHOOK_SECRET (prod).
 *
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/
 */

type VippsCreds = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  msn: string;
};

function creds(mode: "test" | "production"): VippsCreds {
  if (mode === "test") {
    return {
      baseUrl: "https://apitest.vipps.no",
      clientId: process.env.VIPPS_TEST_CLIENT_ID ?? "",
      clientSecret: process.env.VIPPS_TEST_CLIENT_SECRET ?? "",
      subscriptionKey: process.env.VIPPS_TEST_SUBSCRIPTION_KEY ?? "",
      msn: process.env.VIPPS_TEST_MSN ?? "",
    };
  }
  return {
    baseUrl: "https://api.vipps.no",
    clientId: process.env.VIPPS_CLIENT_ID ?? "",
    clientSecret: process.env.VIPPS_CLIENT_SECRET ?? "",
    subscriptionKey: process.env.VIPPS_SUBSCRIPTION_KEY ?? "",
    msn: process.env.VIPPS_MSN ?? "",
  };
}

async function getToken(c: VippsCreds): Promise<string> {
  const res = await fetch(`${c.baseUrl}/accesstoken/get`, {
    method: "POST",
    headers: {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      "Ocp-Apim-Subscription-Key": c.subscriptionKey,
    },
  });
  if (!res.ok) throw new Error(`Token feilet: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

function headers(c: VippsCreds, token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": c.subscriptionKey,
    "Merchant-Serial-Number": c.msn,
    "Content-Type": "application/json",
  };
}

const DEFAULT_EVENTS = [
  "epayments.payment.created.v1",
  "epayments.payment.aborted.v1",
  "epayments.payment.expired.v1",
  "epayments.payment.cancelled.v1",
  "epayments.payment.captured.v1",
  "epayments.payment.refunded.v1",
  "epayments.payment.authorized.v1",
  "epayments.payment.terminated.v1",
];

type AuthCtx = { supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: boolean | null }> }; userId: string };
async function assertAdmin(context: AuthCtx) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Kun administrator kan registrere Vipps-webhooks");
}




export const listVippsWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mode: z.enum(["test", "production"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const c = creds(data.mode);
    const token = await getToken(c);
    const res = await fetch(`${c.baseUrl}/webhooks/v1/webhooks`, {
      headers: headers(c, token),
    });
    if (!res.ok) throw new Error(`List webhooks feilet: ${res.status} ${await res.text()}`);
    return (await res.json()) as { webhooks: Array<{ id: string; url: string; events: string[] }> };
  });

export const registerVippsWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mode: z.enum(["test", "production"]),
        url: z.string().url(),
        events: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const c = creds(data.mode);
    const token = await getToken(c);
    const res = await fetch(`${c.baseUrl}/webhooks/v1/webhooks`, {
      method: "POST",
      headers: headers(c, token),
      body: JSON.stringify({
        url: data.url,
        events: data.events ?? DEFAULT_EVENTS,
      }),
    });
    if (!res.ok) throw new Error(`Register webhook feilet: ${res.status} ${await res.text()}`);
    // Response inneholder { id, secret } — secret må lagres som env var.
    return (await res.json()) as { id: string; secret: string };
  });

export const deleteVippsWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mode: z.enum(["test", "production"]), id: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const c = creds(data.mode);
    const token = await getToken(c);
    const res = await fetch(`${c.baseUrl}/webhooks/v1/webhooks/${data.id}`, {
      method: "DELETE",
      headers: headers(c, token),
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete webhook feilet: ${res.status} ${await res.text()}`);
    }
    return { ok: true };
  });
