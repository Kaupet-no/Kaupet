/**
 * Representative RLS integration test — runs against a local Supabase stack.
 *
 * Setup:
 *   1. `supabase start` (requires Docker)
 *   2. `supabase status` to read the local API URL, anon key and service_role key
 *   3. Export them and run:
 *        LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
 *        LOCAL_SUPABASE_ANON_KEY=... \
 *        LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
 *        bun run test:rls
 *
 * This is one representative example (conversations/messages visibility),
 * not full RLS coverage. Use the same pattern — service-role setup, two
 * signed-in clients, assert who can/can't see what — for other tables.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.LOCAL_SUPABASE_URL;
const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
const PASSWORD = "test-password-12345";

describe.skipIf(!canRun)("RLS: conversations & messages are only visible to participants", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    buyer: `rls-buyer-${suffix}@example.com`,
    seller: `rls-seller-${suffix}@example.com`,
    outsider: `rls-outsider-${suffix}@example.com`,
  };

  const userIds: string[] = [];
  let conversationId: string;

  async function signIn(email: string) {
    const client = createClient(URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    const mkUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    const buyerId = await mkUser(emails.buyer);
    const sellerId = await mkUser(emails.seller);
    await mkUser(emails.outsider);

    const { data: listing, error: listingErr } = await admin
      .from("listings")
      .insert({ seller_id: sellerId, title: "RLS test listing", price_nok: 100, status: "active" })
      .select("id")
      .single();
    if (listingErr) throw listingErr;

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({ listing_id: listing.id, buyer_id: buyerId, seller_id: sellerId })
      .select("id")
      .single();
    if (convErr) throw convErr;
    conversationId = conv.id;

    await admin
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: buyerId, body: "Hei, er den ledig?" });
  });

  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lets a participant (buyer) read the conversation and its messages", async () => {
    const buyer = await signIn(emails.buyer);
    const { data: convs } = await buyer.from("conversations").select("id").eq("id", conversationId);
    expect(convs).toHaveLength(1);

    const { data: messages } = await buyer
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(messages).toHaveLength(1);
  });

  it("hides the conversation and its messages from an unrelated user", async () => {
    const outsider = await signIn(emails.outsider);
    const { data: convs } = await outsider
      .from("conversations")
      .select("id")
      .eq("id", conversationId);
    expect(convs).toHaveLength(0);

    const { data: messages } = await outsider
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(messages).toHaveLength(0);
  });
});
