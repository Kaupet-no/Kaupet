import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SaveSchema = z.object({
  endpoint: z.string().url().min(1).max(2048),
  p256dh: z.string().min(1).max(255),
  auth: z.string().min(1).max(255),
  user_agent: z.string().max(255).optional().nullable(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.user_agent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteSchema = z.object({
  endpoint: z.string().url().min(1).max(2048),
});

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("web_push_messages, web_push_saved_searches, web_push_price_drops")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      web_push_messages: data?.web_push_messages ?? true,
      web_push_saved_searches: data?.web_push_saved_searches ?? true,
      web_push_price_drops: data?.web_push_price_drops ?? true,
    };
  });

const PrefsSchema = z.object({
  web_push_messages: z.boolean(),
  web_push_saved_searches: z.boolean(),
  web_push_price_drops: z.boolean(),
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
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
