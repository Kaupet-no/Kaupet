import { createServerFn } from "@tanstack/react-start";
import { productEventSchema } from "./product-analytics-schema";
export { productEventNames } from "./product-analytics-schema";
export type { ProductEventName, ProductEventProperties } from "./product-analytics-schema";

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
      _event_name: data.eventName,
      _platform: data.platform,
      _path: data.path,
      _properties: data.properties,
    });
    if (error) throw error;
  });
