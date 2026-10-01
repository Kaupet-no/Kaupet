/** RLS integration tests: messages. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  signInWithRetry,
  grantAdmin,
} from "../rls-test-helpers";

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
    return signInWithRetry(email);
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

  // Lokale og CI-stacker har ingen push_dispatch_url. Før
  // 20260928130000_app_settings_url_uten_fallback.sql falt triggerne da
  // tilbake til https://kaupet.no og postet til produksjonen. Nå skal
  // utsendelsen i stedet havne i push_dispatch_failures.
  it("records push dispatch as a failure instead of calling production when push_dispatch_url is unset", async () => {
    const { data: urlRow } = await admin
      .from("app_settings")
      .select("key")
      .eq("key", "push_dispatch_url")
      .maybeSingle();
    expect(urlRow).toBeNull();

    const { data: failures, error } = await admin
      .from("push_dispatch_failures")
      .select("id, error")
      .eq("kind", "conversation_created")
      .eq("payload->>conversation_id", conversationId);
    expect(error).toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures![0].error).toMatch(/push_dispatch_url/);
    await admin
      .from("push_dispatch_failures")
      .delete()
      .in(
        "id",
        failures!.map((f) => f.id),
      );
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

  it("rejects direct message writes, including valid-length bodies (M-7)", async () => {
    const buyer = await signIn(emails.buyer);
    const {
      data: { user: buyerUser },
    } = await buyer.auth.getUser();
    const { error } = await buyer.from("messages").insert({
      conversation_id: conversationId,
      sender_id: buyerUser!.id,
      body: "x".repeat(4001),
    });
    expect(error).not.toBeNull();

    const { error: okError } = await buyer.from("messages").insert({
      conversation_id: conversationId,
      sender_id: buyerUser!.id,
      body: "x".repeat(4000),
    });
    expect(okError).not.toBeNull();
  });
  it("inserts messages atomically and returns the same row for retries", async () => {
    const buyerId = userIds[0]!;
    const clientId = crypto.randomUUID();
    const args = {
      _conversation_id: conversationId,
      _sender_id: buyerId,
      _body: "Idempotent message",
      _attachment_path: null,
      _client_id: clientId,
    };
    const first = await admin.rpc("send_message_rate_limited", args);
    expect(first.error).toBeNull();
    const second = await admin.rpc("send_message_rate_limited", args);
    expect(second.error).toBeNull();
    expect(second.data?.id).toBe(first.data?.id);
  });

  it("stops a blocked pair from messaging in either direction, without affecting unrelated users", async () => {
    const buyerId = userIds[0]!;
    const sellerId = userIds[1]!;
    const outsiderId = userIds[2]!;

    const { data: block, error: blockErr } = await admin
      .from("user_blocks")
      .insert({ blocker_id: buyerId, blocked_id: sellerId, scope: "all" })
      .select("id")
      .single();
    expect(blockErr).toBeNull();

    // Blocked party (seller) tries to message the blocker (buyer).
    const { error: blockedToBlockerErr } = await admin.rpc("send_message_rate_limited", {
      _conversation_id: conversationId,
      _sender_id: sellerId,
      _body: "Forsøk fra blokkert bruker",
      _attachment_path: null,
      _client_id: crypto.randomUUID(),
    });
    expect(blockedToBlockerErr).not.toBeNull();

    // Blocker (buyer) tries to message the blocked party too — blocking is
    // bidirectional.
    const { error: blockerToBlockedErr } = await admin.rpc("send_message_rate_limited", {
      _conversation_id: conversationId,
      _sender_id: buyerId,
      _body: "Forsøk fra blokkerende bruker",
      _attachment_path: null,
      _client_id: crypto.randomUUID(),
    });
    expect(blockerToBlockedErr).not.toBeNull();

    await admin.from("user_blocks").delete().eq("id", block!.id);

    // Unrelated conversation participants are unaffected once the block is
    // gone — same buyer can message again.
    const { error: afterUnblockErr } = await admin.rpc("send_message_rate_limited", {
      _conversation_id: conversationId,
      _sender_id: buyerId,
      _body: "Fungerer igjen etter oppheving",
      _attachment_path: null,
      _client_id: crypto.randomUUID(),
    });
    expect(afterUnblockErr).toBeNull();

    // An outsider blocking the seller must not affect the buyer/seller
    // conversation.
    const { data: unrelatedBlock, error: unrelatedBlockErr } = await admin
      .from("user_blocks")
      .insert({ blocker_id: outsiderId, blocked_id: sellerId, scope: "all" })
      .select("id")
      .single();
    expect(unrelatedBlockErr).toBeNull();

    const { error: stillWorksErr } = await admin.rpc("send_message_rate_limited", {
      _conversation_id: conversationId,
      _sender_id: sellerId,
      _body: "Upåvirket av urelatert blokkering",
      _attachment_path: null,
      _client_id: crypto.randomUUID(),
    });
    expect(stillWorksErr).toBeNull();

    await admin.from("user_blocks").delete().eq("id", unrelatedBlock!.id);
  });

  // R2-migreringen fjernet storage.objects-eksistenssjekken for
  // meldingsvedlegg (se 20260918220000_r2_storage_objects_validation_fixes.sql)
  // — attachment_path kan ikke lenger verifiseres mot en lagret fil, kun mot
  // formatet {conversationId}/{uuid}.{ext} for DENNE samtalen.
  it("accepts a well-formed attachment_path for the conversation but rejects a mismatched or malformed one", async () => {
    const buyerId = userIds[0]!;

    const { error: okError } = await admin.rpc("send_message_rate_limited", {
      _conversation_id: conversationId,
      _sender_id: buyerId,
      _body: "Se vedlagt bilde",
      _attachment_path: `${conversationId}/${crypto.randomUUID()}.jpg`,
      _client_id: crypto.randomUUID(),
    });
    expect(okError).toBeNull();

    const { error: wrongConversationError } = await admin.rpc("send_message_rate_limited", {
      _conversation_id: conversationId,
      _sender_id: buyerId,
      _body: "Feil samtale-id i stien",
      _attachment_path: `${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`,
      _client_id: crypto.randomUUID(),
    });
    expect(wrongConversationError).not.toBeNull();

    const { error: malformedError } = await admin.rpc("send_message_rate_limited", {
      _conversation_id: conversationId,
      _sender_id: buyerId,
      _body: "Ugyldig filnavn i stien",
      _attachment_path: `${conversationId}/not-a-uuid.jpg`,
      _client_id: crypto.randomUUID(),
    });
    expect(malformedError).not.toBeNull();
  });

  it("rejects direct profile writes, including valid-length names (M-7)", async () => {
    const buyer = await signIn(emails.buyer);
    const {
      data: { user: buyerUser },
    } = await buyer.auth.getUser();
    const { error } = await buyer
      .from("profiles")
      .update({ display_name: "x".repeat(81) })
      .eq("id", buyerUser!.id);
    expect(error).not.toBeNull();

    const { error: okError } = await buyer
      .from("profiles")
      .update({ display_name: "x".repeat(80) })
      .eq("id", buyerUser!.id);
    expect(okError).not.toBeNull();
  });

  it("denies category sync to authenticated users", async () => {
    const buyer = await signIn(emails.buyer);
    const { error } = await buyer.rpc("sync_categories_from_payload", {
      p_categories: {},
      p_category_filters: {},
      p_category_flows: {},
      p_filter_synonyms: {},
      p_default_search_examples: [],
      p_synced_by: userIds[0]!,
    });
    expect(error?.code).toBe("42501");
  });

  it("lar hver deltaker flytte sin egen samtale til papirkurven og gjenopprette den", async () => {
    const buyer = await signIn(emails.buyer);
    const seller = await signIn(emails.seller);
    const outsider = await signIn(emails.outsider);
    const { data: buyerUser } = await buyer.auth.getUser();

    const { error: deleteError, count: deleteCount } = await buyer
      .from("conversations")
      .update({ buyer_deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", conversationId);
    expect(deleteError).toBeNull();
    expect(deleteCount).toBe(1);

    const { data: buyerInbox } = await buyer
      .from("conversations")
      .select("id")
      .or(
        `and(buyer_id.eq.${buyerUser.user!.id},buyer_deleted_at.is.null),and(seller_id.eq.${buyerUser.user!.id},seller_deleted_at.is.null)`,
      )
      .eq("id", conversationId);
    expect(buyerInbox).toHaveLength(0);

    const { data: buyerTrash } = await buyer
      .from("conversations")
      .select("id, buyer_deleted_at")
      .eq("id", conversationId)
      .not("buyer_deleted_at", "is", null);
    expect(buyerTrash).toHaveLength(1);

    const { data: sellerInbox } = await seller
      .from("conversations")
      .select("id")
      .eq("id", conversationId);
    expect(sellerInbox).toHaveLength(1);

    const { error: outsiderError, count: outsiderCount } = await outsider
      .from("conversations")
      .update({ buyer_deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", conversationId);
    expect(outsiderError).toBeNull();
    expect(outsiderCount).toBe(0);

    const { error: restoreError, count: restoreCount } = await buyer
      .from("conversations")
      .update({ buyer_deleted_at: null }, { count: "exact" })
      .eq("id", conversationId);
    expect(restoreError).toBeNull();
    expect(restoreCount).toBe(1);
    const expiredAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { error: expireError } = await admin
      .from("conversations")
      .update({ buyer_deleted_at: expiredAt })
      .eq("id", conversationId);
    expect(expireError).toBeNull();

    const { data: expiredTrash } = await buyer
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .gte("buyer_deleted_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
    expect(expiredTrash).toHaveLength(0);

    const { error: expiredRestoreError } = await buyer
      .from("conversations")
      .update({ buyer_deleted_at: null })
      .eq("id", conversationId);
    expect(expiredRestoreError).not.toBeNull();

    await admin.from("conversations").update({ buyer_deleted_at: null }).eq("id", conversationId);
  });
});

describe.skipIf(!canRun)("RLS: F07 message immutability", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    sender: `rls-message-immutable-sender-${suffix}@example.com`,
    other: `rls-message-immutable-other-${suffix}@example.com`,
    outsider: `rls-message-immutable-outsider-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let listingId: string;
  let conversationId: string;
  let messageId: string;
  let attachmentPath: string;
  let clientId: string;
  let blockId: string | undefined;

  beforeAll(async () => {
    const createUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    const senderId = await createUser(emails.sender);
    const otherId = await createUser(emails.other);
    await createUser(emails.outsider);

    const listing = await admin
      .from("listings")
      .insert({ seller_id: otherId, title: "F07 RLS listing", price_nok: 100, status: "active" })
      .select("id")
      .single();
    if (listing.error) throw listing.error;
    listingId = listing.data.id;

    const conversation = await admin
      .from("conversations")
      .insert({ listing_id: listingId, buyer_id: senderId, seller_id: otherId })
      .select("id")
      .single();
    if (conversation.error) throw conversation.error;
    conversationId = conversation.data.id;

    attachmentPath = `${conversationId}/${crypto.randomUUID()}.jpg`;
    clientId = crypto.randomUUID();
    const message = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        body: "F07 immutability fixture",
        attachment_path: attachmentPath,
        client_id: clientId,
      })
      .select("id")
      .single();
    if (message.error) throw message.error;
    messageId = message.data.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    if (blockId) await admin.from("user_blocks").delete().eq("id", blockId);
    if (messageId) {
      await admin
        .from("push_dispatch_failures")
        .delete()
        .eq("kind", "message")
        .eq("payload->>message_id", messageId);
    }
    if (messageId) await admin.from("messages").delete().eq("id", messageId);
    if (conversationId) await admin.from("conversations").delete().eq("id", conversationId);
    if (listingId) await admin.from("listings").delete().eq("id", listingId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("blocks authenticated attachment_path and client_id changes, including for a blocked pair", async () => {
    const senderId = userIds[0]!;
    const otherId = userIds[1]!;
    const sender = await signInWithRetry(emails.sender);
    const block = await admin
      .from("user_blocks")
      .insert({ blocker_id: otherId, blocked_id: senderId, scope: "all" })
      .select("id")
      .single();
    expect(block.error).toBeNull();
    blockId = block.data!.id;

    const attachmentChange = await sender
      .from("messages")
      .update({ attachment_path: `${conversationId}/${crypto.randomUUID()}.jpg` })
      .eq("id", messageId);
    expect(attachmentChange.error).not.toBeNull();

    const clientIdChange = await sender
      .from("messages")
      .update({ client_id: crypto.randomUUID() })
      .eq("id", messageId);
    expect(clientIdChange.error).not.toBeNull();

    const { data: row } = await admin
      .from("messages")
      .select("attachment_path, client_id")
      .eq("id", messageId)
      .single();
    expect(row).toEqual({ attachment_path: attachmentPath, client_id: clientId });
  });

  it("allows only the sender's first soft-delete and denies other or anonymous users", async () => {
    const sender = await signInWithRetry(emails.sender);
    const other = await signInWithRetry(emails.other);
    const anonymous = createClient(URL!, ANON_KEY!);

    const otherDelete = await other
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .select("id");
    expect(otherDelete.error).toBeNull();
    expect(otherDelete.data).toHaveLength(0);

    const anonymousDelete = await anonymous
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId);
    expect(anonymousDelete.error).not.toBeNull();

    const { data: unchanged } = await admin
      .from("messages")
      .select("deleted_at")
      .eq("id", messageId)
      .single();
    expect(unchanged?.deleted_at).toBeNull();

    const deletedAt = new Date().toISOString();
    const ownDelete = await sender
      .from("messages")
      .update({ deleted_at: deletedAt })
      .eq("id", messageId);
    expect(ownDelete.error).toBeNull();

    const reset = await sender.from("messages").update({ deleted_at: null }).eq("id", messageId);
    expect(reset.error).not.toBeNull();
    const changedTimestamp = await sender
      .from("messages")
      .update({ deleted_at: new Date(Date.now() + 2000).toISOString() })
      .eq("id", messageId);
    expect(changedTimestamp.error).not.toBeNull();

    const { data: persisted } = await admin
      .from("messages")
      .select("deleted_at")
      .eq("id", messageId)
      .single();
    expect(Date.parse(persisted!.deleted_at!)).toBe(Date.parse(deletedAt));
  });

  it("rejects immutable-column changes from service_role through the trigger", async () => {
    for (const update of [
      { attachment_path: `${conversationId}/${crypto.randomUUID()}.jpg` },
      { client_id: crypto.randomUUID() },
    ]) {
      const { error } = await admin.from("messages").update(update).eq("id", messageId);
      expect(error?.message).toMatch("Only deleted_at may be updated on messages");
    }
  });
});

describe.skipIf(!canRun)(
  "RLS: system_messages are visible only to their recipient, only admins/moderators can send",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-sysmsg-admin-${suffix}@example.com`,
      recipient: `rls-sysmsg-recipient-${suffix}@example.com`,
      other: `rls-sysmsg-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let recipientId: string;
    let messageId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
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
      const adminId = await mkUser(emails.admin);
      recipientId = await mkUser(emails.recipient);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);

      const { data: msg, error } = await admin
        .from("system_messages")
        .insert({ recipient_id: recipientId, body: "RLS test system message" })
        .select("id")
        .single();
      if (error) throw error;
      messageId = msg.id;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("lets the recipient see and mark their own system message as read", async () => {
      const recipient = await signIn(emails.recipient);
      const { data, error } = await recipient
        .from("system_messages")
        .select("id")
        .eq("id", messageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { error: updateError, count } = await recipient
        .from("system_messages")
        .update({ read_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", messageId);
      expect(updateError).toBeNull();
      expect(count).toBe(1);
    });

    it("hides the system message from an unrelated user", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other.from("system_messages").select("id").eq("id", messageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("blocks a regular user from sending a system message to someone else", async () => {
      const other = await signIn(emails.other);
      const { error } = await other
        .from("system_messages")
        .insert({ recipient_id: recipientId, body: "Impersonated system message" });
      expect(error).not.toBeNull();
    });

    it("lets an admin send a system message", async () => {
      const adminClient = await signIn(emails.admin);
      const { error } = await adminClient
        .from("system_messages")
        .insert({ recipient_id: recipientId, body: "Admin-sent RLS test message" });
      expect(error).toBeNull();
    });
  },
);
