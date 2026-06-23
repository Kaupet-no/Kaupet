import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

// The endpoint is invoked by an internal Postgres trigger via pg_net, which
// sends a shared secret in the X-Push-Dispatch-Secret header (see the
// dispatch_push_for_* trigger functions). As defense in depth, callers
// cannot supply user_id, conversation_id or message body even if the
// secret leaked: only an id is accepted, and everything else is re-derived
// from the database. A forged request that references a non-existent row
// simply does nothing.
function isAuthorized(request: Request): boolean {
  const expected = process.env.PUSH_DISPATCH_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-push-dispatch-secret") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
const PayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    message_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal("saved_search"),
    notification_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal("price_drop"),
    price_drop_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal("sold"),
    sold_notification_id: z.string().uuid(),
  }),
]);

function formatKr(n: number) {
  return new Intl.NumberFormat("nb-NO").format(n) + " kr";
}

type SupabaseAdmin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

async function dispatchPush(params: {
  supabaseAdmin: SupabaseAdmin;
  userId: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
}) {
  const { supabaseAdmin, userId, title, body, url, tag } = params;

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  const webpushModule = (await import("web-push")) as unknown as {
    default?: typeof import("web-push");
  } & typeof import("web-push");
  const webpush = webpushModule.default ?? webpushModule;

  const subject = process.env.VAPID_SUBJECT || "mailto:post@kaupet.no";
  const publicKey =
    "BMRQX3t2gjuYxtGw6f9TNJdz41nQWWd4zyPSBYNAaMNiYsRi73VVBpU6wb0xJ2m1R7MT7De-HQxl-hWbTy5fJbA";
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Missing VAPID configuration");
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const notificationPayload = JSON.stringify({ title, body, url, tag });

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          notificationPayload,
        );
        await supabaseAdmin
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err && "statusCode" in err
            ? (err as { statusCode: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          const body =
            typeof err === "object" && err && "body" in err
              ? (err as { body: unknown }).body
              : undefined;
          console.error("Web push error", { subscriptionId: s.id, statusCode, body, err });
        }
      }
    }),
  );
}

async function dispatchEmail(params: {
  supabaseAdmin: SupabaseAdmin;
  userId: string;
  type: z.infer<typeof PayloadSchema>["type"];
  title: string;
  body: string;
  url: string;
}) {
  const { supabaseAdmin, userId, type, title, body, url } = params;

  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
  const to = user?.user?.email;
  if (!to) return;

  const { sendNotificationEmail } = await import("@/lib/email.server");
  try {
    await sendNotificationEmail({ to, type, subject: title, body, url });
  } catch (err) {
    console.error("Email dispatch error", err);
  }
}

export const Route = createFileRoute("/api/public/push/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const raw = await request.text();
        let payload: z.infer<typeof PayloadSchema>;
        try {
          payload = PayloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Build notification content from authoritative DB rows only.
        let userId: string | null = null;
        let title = "Kaupet.no";
        let body = "";
        let url = "/";
        let tag: string | undefined;

        if (payload.type === "message") {
          const { data: msg } = await supabaseAdmin
            .from("messages")
            .select("id, sender_id, conversation_id, body")
            .eq("id", payload.message_id)
            .maybeSingle();
          if (!msg) return new Response(null, { status: 204 });

          const { data: conv } = await supabaseAdmin
            .from("conversations")
            .select("buyer_id, seller_id")
            .eq("id", msg.conversation_id)
            .maybeSingle();
          if (!conv) return new Response(null, { status: 204 });

          userId = conv.buyer_id === msg.sender_id ? conv.seller_id : conv.buyer_id;
          if (!userId || userId === msg.sender_id) {
            return new Response(null, { status: 204 });
          }

          let senderName = "Noen";
          const { data: p } = await supabaseAdmin
            .from("profiles")
            .select("display_name")
            .eq("id", msg.sender_id)
            .maybeSingle();
          if (p?.display_name) senderName = p.display_name;

          title = `Ny melding fra ${senderName}`;
          body = (msg.body ?? "").slice(0, 140);
          url = `/meldinger/${msg.conversation_id}`;
          tag = `msg-${msg.conversation_id}`;
        } else if (payload.type === "saved_search") {
          const { data: notif } = await supabaseAdmin
            .from("saved_search_notifications")
            .select("user_id, listing_id, saved_search_id")
            .eq("id", payload.notification_id)
            .maybeSingle();
          if (!notif) return new Response(null, { status: 204 });
          userId = notif.user_id;

          const { data: listing } = await supabaseAdmin
            .from("listings")
            .select("title")
            .eq("id", notif.listing_id)
            .maybeSingle();
          const { data: search } = await supabaseAdmin
            .from("saved_searches")
            .select("name")
            .eq("id", notif.saved_search_id)
            .maybeSingle();

          title = `Nytt treff: ${search?.name ?? "Lagret søk"}`;
          body = listing?.title ?? "Ny annonse matcher søket ditt";
          url = `/annonse/${notif.listing_id}`;
          tag = `ss-${notif.saved_search_id}-${notif.listing_id}`;
        } else if (payload.type === "price_drop") {
          const { data: drop } = await supabaseAdmin
            .from("favorite_price_drops")
            .select("user_id, listing_id, old_price_nok, new_price_nok, drop_pct")
            .eq("id", payload.price_drop_id)
            .maybeSingle();
          if (!drop) return new Response(null, { status: 204 });
          userId = drop.user_id;

          const { data: listing } = await supabaseAdmin
            .from("listings")
            .select("title")
            .eq("id", drop.listing_id)
            .maybeSingle();

          const pct = Number(drop.drop_pct).toFixed(0);
          title = `Prisfall: ${listing?.title ?? "Favoritten din"}`;
          body = `Ned ${pct}% · ${formatKr(drop.old_price_nok)} → ${formatKr(drop.new_price_nok)}`;
          url = `/annonse/${drop.listing_id}`;
          tag = `price-drop-${drop.listing_id}`;
        } else {
          const { data: sold } = await supabaseAdmin
            .from("favorite_sold_notifications")
            .select("user_id, listing_id")
            .eq("id", payload.sold_notification_id)
            .maybeSingle();
          if (!sold) return new Response(null, { status: 204 });
          userId = sold.user_id;

          const { data: listing } = await supabaseAdmin
            .from("listings")
            .select("title")
            .eq("id", sold.listing_id)
            .maybeSingle();

          title = "Annonse solgt";
          body = `${listing?.title ?? "Favoritten din"} er ikke lenger tilgjengelig`;
          url = `/annonse/${sold.listing_id}`;
          tag = `sold-${sold.listing_id}`;
        }

        if (!userId) return new Response(null, { status: 204 });

        // Check per-type preference
        const { data: prefs } = await supabaseAdmin
          .from("notification_preferences")
          .select(
            "web_push_messages, web_push_saved_searches, web_push_price_drops, web_push_sold, email_messages, email_saved_searches, email_price_drops, email_sold",
          )
          .eq("user_id", userId)
          .maybeSingle();
        const pushEnabled = {
          message: prefs?.web_push_messages ?? true,
          saved_search: prefs?.web_push_saved_searches ?? true,
          price_drop: prefs?.web_push_price_drops ?? true,
          sold: prefs?.web_push_sold ?? true,
        }[payload.type];
        const emailEnabled = {
          message: prefs?.email_messages ?? false,
          saved_search: prefs?.email_saved_searches ?? false,
          price_drop: prefs?.email_price_drops ?? false,
          sold: prefs?.email_sold ?? false,
        }[payload.type];

        if (!pushEnabled && !emailEnabled) {
          return new Response(null, { status: 204 });
        }

        const tasks: Promise<unknown>[] = [];

        if (pushEnabled) {
          tasks.push(dispatchPush({ supabaseAdmin, userId, title, body, url, tag }));
        }

        if (emailEnabled) {
          tasks.push(
            dispatchEmail({ supabaseAdmin, userId, type: payload.type, title, body, url }),
          );
        }

        await Promise.allSettled(tasks);

        return new Response("ok");
      },
    },
  },
});
