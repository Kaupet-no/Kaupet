import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// The endpoint is invoked by an internal Postgres trigger via pg_net.
// It is intentionally unauthenticated (no auth header), but it is also
// hardened against abuse: callers cannot supply user_id, conversation_id
// or message body. Only an id is accepted, and everything else is
// re-derived from the database. A forged request that references a
// non-existent row simply does nothing.
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
]);

function formatKr(n: number) {
  return new Intl.NumberFormat("nb-NO").format(n) + " kr";
}

export const Route = createFileRoute("/api/public/push/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: z.infer<typeof PayloadSchema>;
        try {
          payload = PayloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

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

          userId =
            conv.buyer_id === msg.sender_id ? conv.seller_id : conv.buyer_id;
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
        } else {
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
        }

        if (!userId) return new Response(null, { status: 204 });

        // Check per-type preference
        const { data: prefs } = await supabaseAdmin
          .from("notification_preferences")
          .select("web_push_messages, web_push_saved_searches")
          .eq("user_id", userId)
          .maybeSingle();
        const messagesEnabled = prefs?.web_push_messages ?? true;
        const savedSearchEnabled = prefs?.web_push_saved_searches ?? true;
        if (payload.type === "message" && !messagesEnabled) {
          return new Response(null, { status: 204 });
        }
        if (payload.type === "saved_search" && !savedSearchEnabled) {
          return new Response(null, { status: 204 });
        }

        // Get all subscriptions for the recipient
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("user_id", userId);

        if (!subs || subs.length === 0) {
          return new Response(null, { status: 204 });
        }

        const webpushModule = (await import("web-push")) as unknown as {
          default?: typeof import("web-push");
        } & typeof import("web-push");
        const webpush = webpushModule.default ?? webpushModule;

        const subject = process.env.VAPID_SUBJECT || "mailto:post@kaupet.no";
        const publicKey =
          "BMRQX3t2gjuYxtGw6f9TNJdz41nQWWd4zyPSBYNAaMNiYsRi73VVBpU6wb0xJ2m1R7MT7De-HQxl-hWbTy5fJbA";
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        if (!privateKey) {
          return new Response("Missing VAPID configuration", { status: 500 });
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
                await supabaseAdmin
                  .from("push_subscriptions")
                  .delete()
                  .eq("id", s.id);
              } else {
                console.error("Web push error", statusCode);
              }
            }
          }),
        );

        return new Response("ok");
      },
    },
  },
});
