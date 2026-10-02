import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** Én siste melding per samtale: en lang tråd må ikke bruke opp den
 * globale radgrensen og få andre samtaler til å se tomme ut. */
export async function lastConversationMessages(
  conversationIds: string[],
  client: SupabaseClient<Database> = supabase,
) {
  const messages = new Map<
    string,
    Pick<
      Database["public"]["Tables"]["messages"]["Row"],
      "body" | "sender_id" | "created_at" | "deleted_at" | "attachment_path"
    >
  >();
  if (conversationIds.length === 0) return messages;

  const { data, error } = await client
    .from("conversations")
    .select("id, messages(body, sender_id, created_at, deleted_at, attachment_path)")
    .in("id", conversationIds)
    .order("created_at", { referencedTable: "messages", ascending: false })
    .order("id", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" });
  if (error) throw error;
  for (const conversation of data ?? []) {
    const message = conversation.messages[0];
    if (message) messages.set(conversation.id, message);
  }
  return messages;
}
