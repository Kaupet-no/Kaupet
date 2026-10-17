import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchAllPagesByIds } from "@/lib/fetch-all-pages";

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
  const { data, error } = await fetchAllPagesByIds(conversationIds, (chunk, from, to) =>
    client
      .from("conversations")
      .select("id, messages(body, sender_id, created_at, deleted_at, attachment_path)")
      .in("id", chunk)
      .order("created_at", { referencedTable: "messages", ascending: false })
      .order("id", { referencedTable: "messages", ascending: false })
      .limit(1, { referencedTable: "messages" })
      .order("id")
      .range(from, to),
  );
  if (data === null) throw error;
  for (const conversation of data) {
    const message = conversation.messages[0];
    if (message) messages.set(conversation.id, message);
  }
  return messages;
}

/** Forhåndsvisning av siste melding i innbokslister. */
export function messagePreview(m: {
  body: string;
  deleted_at: string | null;
  attachment_path: string | null;
}): string {
  if (m.deleted_at) return "Melding slettet";
  if (!m.body.trim() && m.attachment_path) return "📷 Bilde";
  return m.body;
}

export const MESSAGE_PAGE_SIZE = 50;
export type MessageCursor = { created_at: string; id: string };
export type ConversationMessage = MessageCursor & {
  conversation_id: string;
  sender_id: string;
  body: string;
  deleted_at: string | null;
  attachment_path?: string | null;
  pending?: boolean;
  attachmentPreviewUrl?: string;
};
export type MessagePage = {
  messages: ConversationMessage[];
  nextCursor: MessageCursor | undefined;
};

/** Nyeste først. Markøren bruker begge sorteringsfeltene og tåler nye meldinger mellom sidene. */
export async function conversationMessagesPage(
  conversationId: string,
  before: MessageCursor | null = null,
  client: SupabaseClient<Database> = supabase,
): Promise<MessagePage> {
  let query = client
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, deleted_at, attachment_path")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1);
  if (before) {
    query = query.or(
      `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  const messages = (data ?? []).slice(0, MESSAGE_PAGE_SIZE);
  return {
    messages,
    nextCursor: (data?.length ?? 0) > MESSAGE_PAGE_SIZE ? messages.at(-1) : undefined,
  };
}

export type ConversationMessagesData = {
  pages: MessagePage[];
  pageParams: (MessageCursor | null)[];
};

export function mapMessagePages(
  data: ConversationMessagesData | undefined,
  update: (messages: ConversationMessage[]) => ConversationMessage[],
): ConversationMessagesData | undefined {
  return (
    data && {
      ...data,
      pages: data.pages.map((page) => ({ ...page, messages: update(page.messages) })),
    }
  );
}

/** Realtime og sendebekreftelsen kan levere samme melding i vilkårlig rekkefølge. */
export function upsertConversationMessage(
  data: ConversationMessagesData | undefined,
  message: ConversationMessage,
  replaceId?: string,
): ConversationMessagesData {
  const existing = data?.pages.some((page) => page.messages.some((m) => m.id === message.id));
  const next = mapMessagePages(data, (messages) =>
    messages
      .filter((m) => m.id !== replaceId)
      .map((m) => (m.id === message.id ? { ...m, ...message } : m)),
  ) ?? {
    pages: [{ messages: [], nextCursor: undefined }],
    pageParams: [null],
  };
  if (!existing) {
    next.pages = next.pages.map((page, i) =>
      i === 0 ? { ...page, messages: [message, ...page.messages] } : page,
    );
  }
  return next;
}
