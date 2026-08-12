import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const productEventNames = [
  "auth_started",
  "auth_completed",
  "search_opened",
  "search_submitted",
  "search_zero_results",
  "listing_opened",
  "contact_started",
  "favorite_toggled",
  "listing_creation_started",
  "listing_creation_step_completed",
  "listing_published",
  "onboarding_completed",
] as const;

const propertyValueSchema = z.union([
  z.string().max(80),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const productEventSchema = z.object({
  sessionId: z.string().uuid(),
  eventName: z.enum(productEventNames),
  platform: z.enum(["web", "ios", "android"]),
  path: z.string().startsWith("/").max(160),
  properties: z.record(z.string().max(40), propertyValueSchema).default({}),
});

export type ProductEventName = (typeof productEventNames)[number];
export type ProductEventProperties = Record<string, string | number | boolean | null>;

/** Records a deliberately small, non-identifying product event. Telemetry is
 * best effort at the call site and must never block a user action. */
export const logProductEvent = createServerFn({ method: "POST" })
  .validator((input: unknown) => productEventSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { hashRequestIp }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/request-ip.server"),
    ]);
    const { error } = await supabaseAdmin.rpc("log_product_event_rate_limited", {
      _key_hash: await hashRequestIp(),
      _session_id: data.sessionId,
      _event_name: data.eventName,
      _platform: data.platform,
      _path: data.path,
      _properties: data.properties,
    });
    if (error) throw error;
  });
