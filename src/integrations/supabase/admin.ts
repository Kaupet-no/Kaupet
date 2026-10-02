import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Neutral wrapper: *.functions.ts is also reachable from client bundles, so the
// service-role client must only be loaded lazily and never imported statically.
export async function getSupabaseAdmin(): Promise<SupabaseClient<Database>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
