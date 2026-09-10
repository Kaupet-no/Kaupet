import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Throws "Ikke autorisert" unless the given user has the admin role. */
export async function requireAdminRole(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    const { toClientError } = await import("@/lib/to-client-error.server");
    throw await toClientError("database", error);
  }
  if (!data) throw new Error("Ikke autorisert");
}
