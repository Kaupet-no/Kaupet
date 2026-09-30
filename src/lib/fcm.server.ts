// Server-side Firebase Cloud Messaging helpers for the native Android app.
// Mirrors the Web Push dispatch in src/routes/api/public/push/dispatch.ts,
// but targets FCM registration tokens instead of Web Push subscriptions.
//
// Deliberately does NOT use the firebase-admin SDK: it signs the service
// account JWT with Node's `crypto.createSign`, which the Cloudflare Workers
// runtime doesn't implement even with nodejs_compat — every send fails with
// a generic "Could not refresh access token" error. This signs the JWT with
// the Web Crypto API (`crypto.subtle`) instead, which Workers does support,
// and talks to the FCM v1 REST API directly.

import {
  cancelResponseBody,
  HttpDeadlineError,
  readResponseBytes,
  withHttpDeadline,
} from "@/lib/http-bounded.server";
import { describeSafeError } from "@/lib/safe-error";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const HTTP_TIMEOUT_MS = 15_000;
const MAX_OAUTH_RESPONSE_BYTES = 64 * 1024;
const MAX_FCM_RESPONSE_BYTES = 16 * 1024;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(s: string): string {
  return base64url(new TextEncoder().encode(s));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64urlFromString(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  return withHttpDeadline(HTTP_TIMEOUT_MS, async (signal) => {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      redirect: "manual",
      signal,
    });
    if (!res.ok) {
      const status = res.status;
      cancelResponseBody(res);
      throw new Error(`FCM OAuth2 token exchange failed: HTTP ${status}`);
    }
    const bytes = await readResponseBytes(res, MAX_OAUTH_RESPONSE_BYTES, signal);
    let json: { access_token: string; expires_in: number };
    try {
      json = JSON.parse(new TextDecoder().decode(bytes)) as typeof json;
    } catch {
      throw new Error("FCM OAuth2 token response was invalid");
    }
    if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
      throw new Error("FCM OAuth2 token response was invalid");
    }
    cachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return json.access_token;
  });
}

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch (err) {
    console.error("Invalid FCM_SERVICE_ACCOUNT_JSON", describeSafeError(err));
    return null;
  }
}

export async function sendFcmNotifications(params: {
  tokens: { id: string; fcm_token: string }[];
  title: string;
  body: string;
  url: string;
  tag?: string;
  onInvalidToken: (id: string) => Promise<void>;
}): Promise<void> {
  const { tokens, title, body, url, tag, onInvalidToken } = params;
  if (tokens.length === 0) return;

  const sa = getServiceAccount();
  if (!sa) {
    console.error("Missing FCM configuration");
    return;
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch {
    console.error("FCM token exchange error");
    return;
  }

  const sendUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  await Promise.allSettled(
    tokens.map(async ({ id, fcm_token }) => {
      try {
        const result = await withHttpDeadline(HTTP_TIMEOUT_MS, async (signal) => {
          const res = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              message: {
                token: fcm_token,
                notification: { title, body },
                data: { url, ...(tag ? { tag } : {}) },
              },
            }),
            redirect: "manual",
            signal,
          });
          const httpStatus = res.status;
          if (res.ok) {
            cancelResponseBody(res);
            return { httpStatus, status: undefined };
          }

          let status: string | undefined;
          try {
            const bytes = await readResponseBytes(res, MAX_FCM_RESPONSE_BYTES, signal);
            const errJson = JSON.parse(new TextDecoder().decode(bytes)) as {
              error?: { status?: string };
            };
            const providerStatus = errJson.error?.status;
            status = [
              "UNREGISTERED",
              "NOT_FOUND",
              "INVALID_ARGUMENT",
              "UNAVAILABLE",
              "INTERNAL",
              "QUOTA_EXCEEDED",
              "SENDER_ID_MISMATCH",
              "THIRD_PARTY_AUTH_ERROR",
            ].includes(providerStatus ?? "")
              ? providerStatus
              : undefined;
          } catch (error) {
            if (error instanceof HttpDeadlineError) throw error;
            cancelResponseBody(res);
          }
          return { httpStatus, status };
        });
        if (
          result.status === "UNREGISTERED" ||
          result.status === "NOT_FOUND" ||
          result.status === "INVALID_ARGUMENT"
        ) {
          await onInvalidToken(id);
        } else if (result.httpStatus < 200 || result.httpStatus >= 300) {
          console.error("FCM push error", {
            subscriptionId: id,
            httpStatus: result.httpStatus,
            status: result.status,
          });
        }
      } catch {
        console.error("FCM push error", { subscriptionId: id });
      }
    }),
  );
}
