import { toClientError } from "@/lib/to-client-error";
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
    throw await toClientError("database", error);
  }
  if (!data) throw new Error("Ikke autorisert");
}

/** Throws "Ikke autorisert" unless the given user has admin or demo role. */
export async function requireAdminOrDemoRole(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "demo"])
    .limit(1);
  if (error) {
    throw await toClientError("database", error);
  }
  if (!data || data.length === 0) throw new Error("Ikke autorisert");
}
