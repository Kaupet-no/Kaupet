import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Counts a listing page view without storing a browser or user identifier. */
export const logListingView = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { hashRequestIp }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/request-ip.server"),
    ]);
    const { error } = await supabaseAdmin.rpc("log_listing_view_rate_limited", {
      _listing_id: data.listingId,
      _key_hash: await hashRequestIp(),
    });
    if (error) throw error;
  });
