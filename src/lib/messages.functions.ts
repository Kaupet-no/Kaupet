import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().max(4000),
  attachmentPath: z.string().max(512).nullable().optional(),
  clientId: z.string().uuid(),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: message, error } = await supabaseAdmin.rpc("send_message_rate_limited", {
      _conversation_id: data.conversationId,
      _sender_id: context.userId,
      _body: data.body,
      _attachment_path: data.attachmentPath ?? null,
      _client_id: data.clientId,
    });
    if (error) {
      const { toClientError } = await import("@/lib/to-client-error");
      throw await toClientError("database", error);
    }
    return message;
  });
