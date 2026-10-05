import { toClientError } from "@/lib/to-client-error";
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
    .limit(1);
  if (error) {
    throw await toClientError("database", error);
  }
  if (!data?.length) throw new Error("Ikke autorisert");
}
