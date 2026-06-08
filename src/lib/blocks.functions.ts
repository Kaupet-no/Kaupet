import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const blockInput = z.object({
  targetUserId: z.string().uuid(),
  scope: z.enum(["all", "conversation"]),
  conversationId: z.string().uuid().optional(),
  reason: z.string().trim().max(300).optional(),
});

export type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  scope: "all" | "conversation";
  conversation_id: string | null;
  listing_id: string | null;
  reason: string | null;
  created_at: string;
  blocked_profile: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  listing: { id: string; title: string } | null;
};

export const createBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => blockInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.targetUserId === userId) {
      throw new Error("Du kan ikke blokkere deg selv");
    }

    let listingId: string | null = null;
    if (data.scope === "conversation") {
      if (!data.conversationId) {
        throw new Error("conversationId kreves for samtale-blokk");
      }
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("id, buyer_id, seller_id, listing_id")
        .eq("id", data.conversationId)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) throw new Error("Samtalen finnes ikke");
      if (conv.buyer_id !== userId && conv.seller_id !== userId) {
        throw new Error("Du er ikke deltaker i denne samtalen");
      }
      const otherId = conv.buyer_id === userId ? conv.seller_id : conv.buyer_id;
      if (otherId !== data.targetUserId) {
        throw new Error("Mottakeren stemmer ikke med samtalen");
      }
      listingId = conv.listing_id;
    }

    const { error } = await supabase.from("user_blocks").insert({
      blocker_id: userId,
      blocked_id: data.targetUserId,
      scope: data.scope,
      conversation_id: data.scope === "conversation" ? (data.conversationId ?? null) : null,
      listing_id: listingId,
      reason: data.reason ?? null,
    });
    if (error) {
      // 23505 = unique_violation — already blocked
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, alreadyBlocked: true };
      }
      throw error;
    }
    return { ok: true, alreadyBlocked: false };
  });

export const deleteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ blockId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_blocks")
      .delete()
      .eq("id", data.blockId)
      .eq("blocker_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const listMyBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlockRow[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("user_blocks")
      .select("id, blocker_id, blocked_id, scope, conversation_id, listing_id, reason, created_at")
      .eq("blocker_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const list = rows ?? [];
    if (list.length === 0) return [];

    const blockedIds = Array.from(new Set(list.map((r) => r.blocked_id)));
    const listingIds = Array.from(
      new Set(list.map((r) => r.listing_id).filter((x): x is string => !!x)),
    );

    const [{ data: profiles }, listingsRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url").in("id", blockedIds),
      listingIds.length > 0
        ? supabase.from("listings").select("id, title").in("id", listingIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);

    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const lmap = new Map((listingsRes.data ?? []).map((l) => [l.id, l]));

    return list.map((r) => ({
      ...r,
      blocked_profile: pmap.get(r.blocked_id) ?? null,
      listing: r.listing_id ? (lmap.get(r.listing_id) ?? null) : null,
    })) as BlockRow[];
  });

export const listBlocksAgainstMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_blocks")
      .select("scope, blocker_id, conversation_id")
      .eq("blocked_id", userId);
    if (error) throw error;
    return data ?? [];
  });
