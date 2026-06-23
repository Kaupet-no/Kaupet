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

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

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

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`FCM OAuth2 token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch (err) {
    console.error("Invalid FCM_SERVICE_ACCOUNT_JSON", err);
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
  } catch (err) {
    console.error("FCM token exchange error", err);
    return;
  }

  const sendUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  await Promise.allSettled(
    tokens.map(async ({ id, fcm_token }) => {
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
      });
      if (res.ok) return;

      const errJson = (await res.json().catch(() => null)) as {
        error?: { status?: string };
      } | null;
      const status = errJson?.error?.status;
      if (status === "UNREGISTERED" || status === "NOT_FOUND" || status === "INVALID_ARGUMENT") {
        await onInvalidToken(id);
      } else {
        console.error("FCM push error", { subscriptionId: id, httpStatus: res.status, status });
      }
    }),
  );
}
