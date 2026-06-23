// Server-side Firebase Cloud Messaging helpers for the native Android app.
// Mirrors the Web Push dispatch in src/routes/api/public/push/dispatch.ts,
// but targets FCM registration tokens instead of Web Push subscriptions.

import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let app: App | null = null;

function getFirebaseApp(): App | null {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    app = initializeApp({ credential: cert(serviceAccount) });
    return app;
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

  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    console.error("Missing FCM configuration");
    return;
  }
  const messaging = getMessaging(firebaseApp);

  await Promise.allSettled(
    tokens.map(async ({ id, fcm_token }) => {
      try {
        await messaging.send({
          token: fcm_token,
          notification: { title, body },
          data: { url, ...(tag ? { tag } : {}) },
        });
      } catch (err: unknown) {
        const code =
          typeof err === "object" && err && "code" in err
            ? (err as { code: string }).code
            : undefined;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await onInvalidToken(id);
        } else {
          console.error("FCM push error", { subscriptionId: id, code, err });
        }
      }
    }),
  );
}
