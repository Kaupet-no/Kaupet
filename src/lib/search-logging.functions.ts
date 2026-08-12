import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const searchLogSchema = z.object({
  query: z.string().trim().min(1).max(120),
  resultCount: z.number().int().min(0).max(1_000_000),
});

/** Records aggregate search quality telemetry behind a Worker-side abuse
 * boundary. Raw IP addresses are not stored. */
export const logSearchQueryEvent = createServerFn({ method: "POST" })
  .validator((input: unknown) => searchLogSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { hashRequestIp }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/request-ip.server"),
    ]);
    const { error } = await supabaseAdmin.rpc("log_search_query_rate_limited", {
      _key_hash: await hashRequestIp(),
      _query: data.query,
      _result_count: data.resultCount,
    });
    if (error) throw error;
  });
