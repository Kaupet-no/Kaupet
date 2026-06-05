import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const PayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    user_id: z.string().uuid(),
    conversation_id: z.string().uuid(),
    message_id: z.string().uuid(),
    body: z.string().max(2000).optional().nullable(),
  }),
  z.object({
    type: z.literal("saved_search"),
    user_id: z.string().uuid(),
    saved_search_id: z.string().uuid(),
    listing_id: z.string().uuid(),
  }),
]);

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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Check preferences (per type)
        const { data: prefs } = await supabaseAdmin
          .from("notification_preferences")
          .select("web_push_messages, web_push_saved_searches")
          .eq("user_id", payload.user_id)
          .maybeSingle();

        const messagesEnabled = prefs?.web_push_messages ?? true;
        const savedSearchEnabled = prefs?.web_push_saved_searches ?? true;
        if (payload.type === "message" && !messagesEnabled) {
          return new Response(null, { status: 204 });
        }
        if (payload.type === "saved_search" && !savedSearchEnabled) {
          return new Response(null, { status: 204 });
        }

        // Build notification content
        let title = "Kaupet.no";
        let body = "";
        let url = "/";
        let tag: string | undefined;

        if (payload.type === "message") {
          // Look up sender's display name
          const { data: msg } = await supabaseAdmin
            .from("messages")
            .select("sender_id")
            .eq("id", payload.message_id)
            .maybeSingle();
          let senderName = "Noen";
          if (msg?.sender_id) {
            const { data: p } = await supabaseAdmin
              .from("profiles")
              .select("display_name")
              .eq("id", msg.sender_id)
              .maybeSingle();
            if (p?.display_name) senderName = p.display_name;
          }
          title = `Ny melding fra ${senderName}`;
          body = payload.body?.slice(0, 140) ?? "";
          url = `/meldinger/${payload.conversation_id}`;
          tag = `msg-${payload.conversation_id}`;
        } else {
          const { data: listing } = await supabaseAdmin
            .from("listings")
            .select("title")
            .eq("id", payload.listing_id)
            .maybeSingle();
          const { data: search } = await supabaseAdmin
            .from("saved_searches")
            .select("name")
            .eq("id", payload.saved_search_id)
            .maybeSingle();
          title = `Nytt treff: ${search?.name ?? "Lagret søk"}`;
          body = listing?.title ?? "Ny annonse matcher søket ditt";
          url = `/annonse/${payload.listing_id}`;
          tag = `ss-${payload.saved_search_id}-${payload.listing_id}`;
        }

        // Get all subscriptions for the user
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("user_id", payload.user_id);

        if (!subs || subs.length === 0) {
          return new Response(null, { status: 204 });
        }

        const webpushModule = await import("web-push");
        const webpush = (webpushModule as { default?: typeof webpushModule }).default ?? webpushModule;

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
                console.error("Web push error", statusCode, err);
              }
            }
          }),
        );

        return new Response("ok");
      },
    },
  },
});
