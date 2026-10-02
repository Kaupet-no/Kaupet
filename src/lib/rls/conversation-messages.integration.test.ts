import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { lastConversationMessages } from "../conversation-messages";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  createRlsUser,
  signInWithRetry,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("siste melding per samtale", () => {
  const admin = canRun ? createClient<Database>(URL!, SERVICE_ROLE_KEY!) : null!;
  const userIds: string[] = [];
  const conversationIds: string[] = [];
  const suffix = `last-message-${Date.now()}`;
  const sellerEmail = `${suffix}-seller@example.com`;
  const outsiderEmail = `${suffix}-outsider@example.com`;
  let listingId: string;

  beforeAll(async () => {
    const sellerId = await createRlsUser(admin, sellerEmail, userIds);
    await createRlsUser(admin, outsiderEmail, userIds);
    const { data: listing, error: listingError } = await admin
      .from("listings")
      .insert({ seller_id: sellerId, title: "Meldingsgrense", price_nok: 100, status: "active" })
      .select("id")
      .single();
    if (listingError) throw listingError;
    listingId = listing.id;
    for (let i = 0; i < 3; i++) {
      const buyerId = await createRlsUser(admin, `${suffix}-buyer-${i}@example.com`, userIds);
      const { data: conversation, error } = await admin
        .from("conversations")
        .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
        .select("id")
        .single();
      if (error) throw error;
      conversationIds.push(conversation.id);
    }
    const { error } = await admin.from("messages").insert([
      ...Array.from({ length: 1001 }, (_, i) => ({
        conversation_id: conversationIds[0],
        sender_id: sellerId,
        body: `Lang tråd ${i}`,
        created_at: new Date(Date.now() - 2000 + i).toISOString(),
      })),
      {
        conversation_id: conversationIds[1],
        sender_id: sellerId,
        body: "Eldre samtale æøå 👋",
        created_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);
    if (error) throw error;
  }, 60_000);

  afterAll(async () => {
    if (!canRun) return;
    for (const id of conversationIds) {
      await admin.from("push_dispatch_failures").delete().eq("payload->>conversation_id", id);
    }
    await admin.from("messages").delete().in("conversation_id", conversationIds);
    await admin.from("conversations").delete().in("id", conversationIds);
    if (listingId) await admin.from("listings").delete().eq("id", listingId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("grenseverdi: over 1000 meldinger i én tråd skjuler ikke en annen samtale", async () => {
    const seller = await signInWithRetry(sellerEmail);
    // Den gamle globale spørringen mister den eldre samtalen ved API-grensen.
    const { data: truncated, error } = await seller
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });
    expect(error).toBeNull();
    expect(truncated).toHaveLength(1000);
    expect(new Set(truncated!.map((message) => message.conversation_id))).toEqual(
      new Set([conversationIds[0]]),
    );

    const messages = await lastConversationMessages(conversationIds, seller);
    expect([...messages.keys()].sort()).toEqual(conversationIds.slice(0, 2).sort());
    expect(messages.get(conversationIds[0])?.body).toBe("Lang tråd 1000");
    expect(messages.get(conversationIds[1])?.body).toBe("Eldre samtale æøå 👋");
    expect(messages.has(conversationIds[2])).toBe(false);
  });

  it("bevarer RLS for andre brukere og anonyme", async () => {
    const outsider = await signInWithRetry(outsiderEmail);
    const anon = createClient<Database>(URL!, ANON_KEY!);
    expect(await lastConversationMessages(conversationIds, outsider)).toEqual(new Map());
    expect(await lastConversationMessages(conversationIds, anon)).toEqual(new Map());
  });
});
