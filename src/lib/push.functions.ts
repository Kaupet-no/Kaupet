import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SaveSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("web"),
    endpoint: z.string().url().min(1).max(2048),
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
    user_agent: z.string().max(255).optional().nullable(),
  }),
  z.object({
    platform: z.literal("android"),
    fcm_token: z.string().min(1).max(255),
    user_agent: z.string().max(255).optional().nullable(),
  }),
  z.object({
    platform: z.literal("ios"),
    fcm_token: z.string().min(1).max(255),
    user_agent: z.string().max(255).optional().nullable(),
  }),
]);

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.platform === "web") {
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          platform: "web",
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.user_agent ?? null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          platform: data.platform,
          fcm_token: data.fcm_token,
          user_agent: data.user_agent ?? null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "fcm_token" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const DeleteSchema = z.union([
  z.object({ endpoint: z.string().url().min(1).max(2048) }),
  z.object({ fcm_token: z.string().min(1).max(255) }),
]);

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let query = supabase.from("push_subscriptions").delete().eq("user_id", userId);
    query =
      "endpoint" in data
        ? query.eq("endpoint", data.endpoint)
        : query.eq("fcm_token", data.fcm_token);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUserPushSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, platform, user_agent, created_at, last_used_at, endpoint, fcm_token")
      .eq("user_id", userId)
      .order("last_used_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deletePushSubscriptionById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notification_preferences")
      .select(
        "web_push_messages, web_push_saved_searches, web_push_price_drops, web_push_sold, email_messages, email_saved_searches, email_price_drops, email_sold",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      web_push_messages: data?.web_push_messages ?? true,
      web_push_saved_searches: data?.web_push_saved_searches ?? true,
      web_push_price_drops: data?.web_push_price_drops ?? true,
      web_push_sold: data?.web_push_sold ?? true,
      email_messages: data?.email_messages ?? false,
      email_saved_searches: data?.email_saved_searches ?? false,
      email_price_drops: data?.email_price_drops ?? false,
      email_sold: data?.email_sold ?? false,
    };
  });

const PrefsSchema = z.object({
  web_push_messages: z.boolean(),
  web_push_saved_searches: z.boolean(),
  web_push_price_drops: z.boolean(),
  web_push_sold: z.boolean(),
  email_messages: z.boolean(),
  email_saved_searches: z.boolean(),
  email_price_drops: z.boolean(),
  email_sold: z.boolean(),
});

export const updateNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PrefsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: userId,
        web_push_messages: data.web_push_messages,
        web_push_saved_searches: data.web_push_saved_searches,
        web_push_price_drops: data.web_push_price_drops,
        web_push_sold: data.web_push_sold,
        email_messages: data.email_messages,
        email_saved_searches: data.email_saved_searches,
        email_price_drops: data.email_price_drops,
        email_sold: data.email_sold,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
