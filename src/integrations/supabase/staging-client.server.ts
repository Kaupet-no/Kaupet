// Server-side Supabase client pointed at the STAGING project with its
// publishable key. Category data is public-read; this must not hold a
// service-role key because the client runs in the production Worker.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createStagingReadClient() {
  const stagingUrl = process.env.STAGING_SUPABASE_URL;
  const stagingPublishableKey = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY;

  if (!stagingUrl || !stagingPublishableKey) {
    const missing = [
      ...(!stagingUrl ? ["STAGING_SUPABASE_URL"] : []),
      ...(!stagingPublishableKey ? ["STAGING_SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Mangler miljøvariabel for staging-synk: ${missing.join(", ")}.`);
  }

  return createClient<Database>(stagingUrl, stagingPublishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let stagingReadClient: ReturnType<typeof createStagingReadClient> | undefined;

/** Read-only client used by the production admin category synchronizer. */
export const stagingAdmin = new Proxy({} as ReturnType<typeof createStagingReadClient>, {
  get(_, prop, receiver) {
    if (!stagingReadClient) stagingReadClient = createStagingReadClient();
    return Reflect.get(stagingReadClient, prop, receiver);
  },
});
