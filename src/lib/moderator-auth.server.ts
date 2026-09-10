import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function requireAdminOrModeratorRole(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"])
    .maybeSingle();
  if (error) {
    const { toClientError } = await import("@/lib/to-client-error.server");
    throw await toClientError("database", error);
  }
  if (!data) throw new Error("Ikke autorisert");
}
