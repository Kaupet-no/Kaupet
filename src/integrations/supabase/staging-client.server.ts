// Server-side Supabase client pointed at the STAGING project, authenticated
// with staging's service role key — bypasses staging's RLS. Used only by the
// production admin panel's "Synkroniser fra staging"-knapp
// (src/lib/category-sync.functions.ts) to read staging's category data.
// SECURITY: server-only, never expose to client code.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createStagingAdminClient() {
  const STAGING_SUPABASE_URL = process.env.STAGING_SUPABASE_URL;
  const STAGING_SUPABASE_SERVICE_ROLE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;

  if (!STAGING_SUPABASE_URL || !STAGING_SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!STAGING_SUPABASE_URL ? ["STAGING_SUPABASE_URL"] : []),
      ...(!STAGING_SUPABASE_SERVICE_ROLE_KEY ? ["STAGING_SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(
      `Mangler miljøvariabel for staging-synk: ${missing.join(", ")}. Sett dem i .env / som Worker-secrets.`,
    );
  }

  return createClient<Database>(STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _stagingAdmin: ReturnType<typeof createStagingAdminClient> | undefined;

export const stagingAdmin = new Proxy({} as ReturnType<typeof createStagingAdminClient>, {
  get(_, prop, receiver) {
    if (!_stagingAdmin) _stagingAdmin = createStagingAdminClient();
    return Reflect.get(_stagingAdmin, prop, receiver);
  },
});
