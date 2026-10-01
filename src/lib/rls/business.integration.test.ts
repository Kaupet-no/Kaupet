/** RLS integration tests: business. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createTestCategory,
  createRlsUser,
  signInWithRetry,
  registerCategoryCleanup,
} from "../rls-test-helpers";

describe.skipIf(!canRun)(
  "RLS: business organizations, listings, messages, storage and Proff entitlement",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-business-owner-${suffix}@example.com`,
      member: `rls-business-member-${suffix}@example.com`,
      buyer: `rls-business-buyer-${suffix}@example.com`,
      other: `rls-business-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const locationIds = new Map<string, string>();
    let ownerId: string;
    let memberId: string;
    let buyerId: string;
    let otherId: string;
    let organizationId: string;
    let otherOrganizationId: string;
    let memberListingId: string;
    let ownerListingId: string;
    let otherOrganizationListingId: string;
    let insertedListingId: string;
    let conversationId: string;

    async function signIn(email: string) {
      return signInWithRetry(email);
    }

    beforeAll(async () => {
      const createUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        const id = data.user!.id;
        userIds.push(id);
        return id;
      };

      ownerId = await createUser(emails.owner);
      memberId = await createUser(emails.member);
      buyerId = await createUser(emails.buyer);
      otherId = await createUser(emails.other);

      const createOrganization = async (number: string, name: string) => {
        const now = Date.now();
        const { data, error } = await admin
          .from("organizations")
          .insert({
            organization_number: number,
            legal_name: name,
            display_name: name,
            selected_plan: "proff",
            proff_trial_started_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
            proff_trial_ends_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
            proff_access_until: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
            // This block tests membership/listing/storage RLS, not M-4's
            // registration-affiliation gate — grandfather these orgs in as
            // verified like a real approved business.
            verification_status: "verified",
          })
          .select("id")
          .single();
        if (error) throw error;
        if (!data) throw new Error("Organization insert returned no row");
        organizationIds.push(data.id);
        const { data: location, error: locationError } = await admin
          .from("organization_locations")
          .insert({
            organization_id: data.id,
            name: "Hovedlokasjon",
            address_line: "Storgata 1",
            postal_code: "0001",
            city: "Oslo",
            is_default: true,
          })
          .select("id")
          .single();
        if (locationError) throw locationError;
        if (!location) throw new Error("Location insert returned no row");
        locationIds.set(data.id, location.id);
        return data.id;
      };
      const organizationNumber = 100_000_000 + (suffix % 800_000_000);
      organizationId = await createOrganization(
        String(organizationNumber),
        `RLS Bedrift ${suffix}`,
      );
      otherOrganizationId = await createOrganization(
        String(organizationNumber + 1),
        `RLS Annen bedrift ${suffix}`,
      );

      const { error: memberError } = await admin.from("organization_members").insert([
        { organization_id: organizationId, user_id: ownerId, role: "superuser", status: "active" },
        { organization_id: organizationId, user_id: memberId, role: "member", status: "active" },
        {
          organization_id: otherOrganizationId,
          user_id: otherId,
          role: "superuser",
          status: "active",
        },
      ]);
      if (memberError) throw memberError;
      const { error: locationMemberError } = await admin
        .from("organization_location_members")
        .insert([
          {
            organization_id: organizationId,
            location_id: locationIds.get(organizationId)!,
            user_id: ownerId,
            role: "manager",
            listing_access: "all",
            listing_edit_scope: "all",
            chat_access: "all",
          },
          {
            organization_id: organizationId,
            location_id: locationIds.get(organizationId)!,
            user_id: memberId,
            role: "member",
            listing_access: "all",
            listing_edit_scope: "all",
            chat_access: "all",
          },
          {
            organization_id: otherOrganizationId,
            location_id: locationIds.get(otherOrganizationId)!,
            user_id: otherId,
            role: "manager",
            listing_access: "all",
            listing_edit_scope: "all",
            chat_access: "all",
          },
        ]);
      if (locationMemberError) throw locationMemberError;

      const createListing = async (
        sellerId: string,
        listingOrganizationId: string,
        status: "draft" | "active",
        title: string,
      ) => {
        const { data, error } = await admin
          .from("listings")
          .insert({
            seller_id: sellerId,
            organization_id: listingOrganizationId,
            organization_location_id: locationIds.get(listingOrganizationId)!,
            title,
            price_nok: 100,
            status,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      };

      memberListingId = await createListing(
        memberId,
        organizationId,
        "draft",
        "RLS business member draft",
      );
      ownerListingId = await createListing(
        memberId,
        organizationId,
        "active",
        "RLS business owner active",
      );
      otherOrganizationListingId = await createListing(
        otherId,
        otherOrganizationId,
        "draft",
        "RLS other business draft",
      );

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({ listing_id: ownerListingId, buyer_id: buyerId, seller_id: memberId })
        .select("id")
        .single();
      if (conversationError) throw conversationError;
      conversationId = conversation.id;

      const { error: messageError } = await admin.from("messages").insert({
        conversation_id: conversationId,
        sender_id: buyerId,
        body: "Er annonsen fortsatt tilgjengelig?",
      });
      if (messageError) throw messageError;
    });

    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(
        organizationIds.map((id) => admin.from("organizations").delete().eq("id", id)),
      );
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("isolates organization members while exposing public organization rows", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);
      const anon = createClient(URL!, ANON_KEY!);

      const { data: ownerMembers, error: ownerError } = await owner
        .from("organization_members")
        .select("organization_id, user_id, role")
        .eq("organization_id", organizationId);
      expect(ownerError).toBeNull();
      expect(ownerMembers).toHaveLength(2);

      const { data: memberRows, error: memberError } = await member
        .from("organization_members")
        .select("organization_id, user_id")
        .in("organization_id", [organizationId, otherOrganizationId]);
      expect(memberError).toBeNull();
      expect(memberRows).toEqual([{ organization_id: organizationId, user_id: memberId }]);

      const { data: otherRows, error: otherError } = await other
        .from("organization_members")
        .select("organization_id, user_id")
        .in("organization_id", [organizationId, otherOrganizationId]);
      expect(otherError).toBeNull();
      expect(otherRows).toEqual([{ organization_id: otherOrganizationId, user_id: otherId }]);

      // M-5: the base table is member-only now — commercial state
      // (selected_plan, proff_access_until, ...) must not be readable by
      // anon or by a member of a different organization.
      const { data: anonBaseRow, error: anonBaseError } = await anon
        .from("organizations")
        .select("id")
        .eq("id", organizationId);
      expect(anonBaseError).toBeNull();
      expect(anonBaseRow).toHaveLength(0);

      const { data: otherBaseRow, error: otherBaseError } = await other
        .from("organizations")
        .select("id")
        .eq("id", organizationId);
      expect(otherBaseError).toBeNull();
      expect(otherBaseRow).toHaveLength(0);

      // The public view exposes only branding columns, for every org — it
      // never had a selected_plan column to select in the first place.
      const { error: publicError } = await anon
        .from("organizations_public")
        .select("id, selected_plan" as "id")
        .in("id", [organizationId, otherOrganizationId]);
      expect(publicError).not.toBeNull();

      const { data: publicSafeColumns, error: publicSafeError } = await anon
        .from("organizations_public")
        .select("id, listing_concept, listing_font, listing_overtitle")
        .in("id", [organizationId, otherOrganizationId]);
      expect(publicSafeError).toBeNull();
      expect(publicSafeColumns?.map((row) => row.id).sort()).toEqual(
        [organizationId, otherOrganizationId].sort(),
      );
      expect(
        publicSafeColumns?.every(
          (row) =>
            row.listing_concept === "redaksjonell" &&
            row.listing_font === "newsreader" &&
            row.listing_overtitle === "presentert_av",
        ),
      ).toBe(true);
      const { error: anonymousMembershipError } = await anon
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", organizationId);
      expect(anonymousMembershipError).not.toBeNull();

      const { error: directMembershipInsertError } = await member
        .from("organization_members")
        .insert({
          organization_id: organizationId,
          user_id: buyerId,
          role: "member",
          status: "active",
        });
      expect(directMembershipInsertError).not.toBeNull();
      const { error: directOrganizationUpdateError } = await owner
        .from("organizations")
        .update({ display_name: "forged" })
        .eq("id", organizationId);
      expect(directOrganizationUpdateError).not.toBeNull();
    });

    it("allows business listing access only within the matching membership boundary", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);
      const anon = createClient(URL!, ANON_KEY!);

      const { data: ownerListings, error: ownerError } = await owner
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(ownerError).toBeNull();
      expect(ownerListings?.map((row) => row.id).sort()).toEqual(
        [memberListingId, ownerListingId].sort(),
      );

      const { data: memberListings, error: memberError } = await member
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(memberError).toBeNull();
      expect(memberListings?.map((row) => row.id).sort()).toEqual(
        [memberListingId, ownerListingId].sort(),
      );

      const { data: otherListings, error: otherError } = await other
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(otherError).toBeNull();
      expect(otherListings?.map((row) => row.id).sort()).toEqual(
        [ownerListingId, otherOrganizationListingId].sort(),
      );

      const { data: anonymousListings, error: anonymousError } = await anon
        .from("listings")
        .select("id")
        .in("id", [memberListingId, ownerListingId, otherOrganizationListingId]);
      expect(anonymousError).toBeNull();
      expect(anonymousListings).toEqual([{ id: ownerListingId }]);

      const { error: anonymousInsertError } = await anon.from("listings").insert({
        seller_id: memberId,
        organization_id: organizationId,
        title: "RLS anonymous business listing",
        price_nok: 101,
        status: "draft",
      });
      expect(anonymousInsertError).not.toBeNull();

      const { data: insertedListing, error: insertError } = await admin
        .from("listings")
        .insert({
          seller_id: memberId,
          organization_id: organizationId,
          organization_location_id: locationIds.get(organizationId)!,
          title: "RLS member-created business listing",
          price_nok: 101,
          status: "draft",
        })
        .select("id")
        .single();
      expect(insertError).toBeNull();
      expect(insertedListing?.id).toBeTruthy();
      insertedListingId = insertedListing!.id;

      const { error: forgedInsertError } = await member.from("listings").insert({
        seller_id: memberId,
        organization_id: otherOrganizationId,
        title: "RLS forged organization listing",
        price_nok: 101,
        status: "draft",
      });
      expect(forgedInsertError).not.toBeNull();

      const { error: memberUpdateError, count: memberUpdateCount } = await member
        .from("listings")
        .update({ title: "RLS member updated listing" }, { count: "exact" })
        .eq("id", memberListingId);
      expect(memberUpdateError).toBeNull();
      expect(memberUpdateCount).toBe(1);

      const { error: outsiderUpdateError, count: outsiderUpdateCount } = await other
        .from("listings")
        .update({ title: "RLS cross-business update" }, { count: "exact" })
        .eq("id", memberListingId);
      expect(outsiderUpdateError).toBeNull();
      expect(outsiderUpdateCount).toBe(0);

      const { count: ownerDeleteCount } = await owner
        .from("listings")
        .delete({ count: "exact" })
        .eq("id", insertedListingId);
      expect(ownerDeleteCount).toBe(1);
    });

    // R2-migreringen fjernet listing_images_write/_delete (storage.objects-
    // policyer, se 20260918210000_drop_dead_storage_object_policies.sql) —
    // opplasting går nå til R2, ikke Supabase Storage. Autorisasjonen som lå
    // i den policyen er gjenskapt i RPC-en can_upload_listing_image
    // (20260918100000_can_upload_listing_image.sql), som denne testen nå
    // kaller direkte som de ulike brukerne, siden funksjonen er `security
    // definer` og bruker auth.uid() akkurat som policyen gjorde. Vi tester
    // ikke lenger den faktiske metadata-innsettingen i listing_images her
    // (dekket av "Owners can manage listing images"-policyen og RLS-testene
    // for listings ovenfor) — kun autorisasjonsbeslutningen serverfunksjonen
    // (uploadListingImage/uploadListingImageThumb/deleteListingImage) spør om.
    it("lets an authorized organization member/superuser upload, but not an outsider", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);

      const canUpload = async (client: SupabaseClient) => {
        const { data, error } = await client.rpc("can_upload_listing_image", {
          _listing_id: memberListingId,
        });
        expect(error).toBeNull();
        return data;
      };

      expect(await canUpload(owner)).toBe(true);
      expect(await canUpload(member)).toBe(true);
      expect(await canUpload(other)).toBe(false);
    });

    it("lets an organization superuser read and send messages, but not another business", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);

      const { data: ownerConversations, error: ownerConversationError } = await owner
        .from("conversations")
        .select("id")
        .eq("id", conversationId);
      expect(ownerConversationError).toBeNull();
      expect(ownerConversations).toHaveLength(1);

      const { data: ownerMessages, error: ownerMessageError } = await owner
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId);
      expect(ownerMessageError).toBeNull();
      expect(ownerMessages).toHaveLength(1);

      const { data: memberConversations, error: memberConversationError } = await member
        .from("conversations")
        .select("id")
        .eq("id", conversationId);
      expect(memberConversationError).toBeNull();
      expect(memberConversations).toHaveLength(1);

      const { data: memberMessages, error: memberMessageError } = await member
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId);
      expect(memberMessageError).toBeNull();
      expect(memberMessages).toHaveLength(1);

      const { data: otherConversations, error: otherConversationError } = await other
        .from("conversations")
        .select("id")
        .eq("id", conversationId);
      expect(otherConversationError).toBeNull();
      expect(otherConversations).toHaveLength(0);

      const { error: sendError } = await owner.from("messages").insert({
        conversation_id: conversationId,
        sender_id: ownerId,
        body: "Jeg følger opp på vegne av bedriften.",
      });
      expect(sendError).not.toBeNull();

      const { error: readUpdateError, count: readUpdateCount } = await owner
        .from("conversations")
        .update({ seller_last_read_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", conversationId);
      expect(readUpdateError).toBeNull();
      expect(readUpdateCount).toBe(1);

      const { error: outsiderSendError } = await other.from("messages").insert({
        conversation_id: conversationId,
        sender_id: otherId,
        body: "Cross-business message",
      });
      expect(outsiderSendError).not.toBeNull();
    });

    // R2-migreringen fjernet organization_logos_superuser_insert/_update/_delete
    // (storage.objects-policyer, se
    // 20260918210000_drop_dead_storage_object_policies.sql) — opplasting går
    // nå til R2 via uploadOrganizationLogo i src/lib/storage.functions.ts,
    // som sjekker nøyaktig de to betingelsene policyen krevde:
    // is_organization_superuser og organization_has_proff_access. Begge er
    // allerede GRANT EXECUTE'd til `authenticated` og kalles her direkte som
    // de ulike brukerne. Offentlig lesing (organization_logos_public_read)
    // trengte ingen erstatning — organization-logos var allerede en offentlig
    // bucket, så det fantes ingen beskyttet lesing å miste.
    it("allows only an effective-Proff superuser to write organization logos", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);

      const isSuperuser = async (client: SupabaseClient) => {
        const { data, error } = await client.rpc("is_organization_superuser", {
          _organization_id: organizationId,
        });
        expect(error).toBeNull();
        return data;
      };

      expect(await isSuperuser(owner)).toBe(true);
      expect(await isSuperuser(member)).toBe(false);
      expect(await isSuperuser(other)).toBe(false);

      const { data: proffAccess, error: proffAccessError } = await owner.rpc(
        "organization_has_proff_access",
        { _organization_id: organizationId },
      );
      expect(proffAccessError).toBeNull();
      expect(proffAccess).toBe(true);
    });

    it("enforces the Proff entitlement boundary for owner, member, other user and anon", async () => {
      const owner = await signIn(emails.owner);
      const member = await signIn(emails.member);
      const other = await signIn(emails.other);
      const anon = createClient(URL!, ANON_KEY!);

      const access = async (client: SupabaseClient) => {
        const { data, error } = await client.rpc("can_act_for_organization", {
          _organization_id: organizationId,
        });
        expect(error).toBeNull();
        return data;
      };

      expect(await access(owner)).toBe(true);
      expect(await access(member)).toBe(true);
      expect(await access(other)).toBe(false);
      expect(await access(anon)).toBe(false);

      const expiredAt = new Date(Date.now() - 1_000).toISOString();
      const { error: expirationError } = await admin
        .from("organizations")
        .update({ proff_access_until: expiredAt })
        .eq("id", organizationId);
      expect(expirationError).toBeNull();

      const { error: syncError } = await admin.rpc("sync_organization_entitlements", {
        _organization_id: organizationId,
      });
      expect(syncError).toBeNull();

      expect(await access(owner)).toBe(true);
      expect(await access(member)).toBe(false);
      expect(await access(other)).toBe(false);
      expect(await access(anon)).toBe(false);

      const { data: deactivatedMember, error: memberStatusError } = await owner
        .from("organization_members")
        .select("status")
        .eq("organization_id", organizationId)
        .eq("user_id", memberId)
        .single();
      expect(memberStatusError).toBeNull();
      expect(deactivatedMember?.status).toBe("deactivated");

      const { data: expiredMemberListing, error: expiredListingError } = await member
        .from("listings")
        .select("id")
        .eq("id", memberListingId);
      expect(expiredListingError).toBeNull();
      expect(expiredMemberListing).toHaveLength(0);
      const { data: ownerStillSeesListing, error: ownerListingError } = await owner
        .from("listings")
        .select("id")
        .eq("id", memberListingId);
      expect(ownerListingError).toBeNull();
      expect(ownerStillSeesListing).toHaveLength(1);

      // organization_logos_superuser_insert/_update/_delete required both
      // is_organization_superuser AND organization_has_proff_access — the
      // owner is still a superuser after expiry, but the org no longer has
      // Proff access, so uploadOrganizationLogo must now reject the owner too.
      const { data: ownerStillSuperuser, error: ownerSuperuserError } = await owner.rpc(
        "is_organization_superuser",
        { _organization_id: organizationId },
      );
      expect(ownerSuperuserError).toBeNull();
      expect(ownerStillSuperuser).toBe(true);

      const { data: expiredProffAccess, error: expiredProffAccessError } = await owner.rpc(
        "organization_has_proff_access",
        { _organization_id: organizationId },
      );
      expect(expiredProffAccessError).toBeNull();
      expect(expiredProffAccess).toBe(false);
    });

    it("keeps proff_orders server-only and stacks paid terms on remaining access", async () => {
      const owner = await signIn(emails.owner);
      const anon = createClient(URL!, ANON_KEY!);

      const { data: order, error: orderError } = await admin
        .from("proff_orders")
        .insert({
          organization_id: otherOrganizationId,
          term: "monthly",
          price_ex_vat_nok: 1490,
          billing_email: `faktura-${suffix}@example.com`,
        })
        .select("id")
        .single();
      expect(orderError).toBeNull();

      // Billing data must never leak to the client, not even to the superuser.
      for (const client of [owner, anon]) {
        const { data, error } = await client.from("proff_orders").select("id");
        expect(error !== null || (data ?? []).length === 0).toBe(true);
      }

      const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { error: expireError } = await admin
        .from("organizations")
        .update({ proff_access_until: expiredAt })
        .eq("id", otherOrganizationId);
      expect(expireError).toBeNull();

      const extend = async (months: number) => {
        const { data, error } = await admin
          .rpc("extend_proff_access", { _organization_id: otherOrganizationId, _months: months })
          .single();
        expect(error).toBeNull();
        return data as unknown as { period_start: string; period_end: string };
      };

      // Expired access starts a fresh period from now, not from the old date.
      const first = await extend(1);
      expect(Date.parse(first.period_start)).toBeGreaterThan(Date.parse(expiredAt));
      expect(Date.parse(first.period_end)).toBeGreaterThan(Date.now());

      // A renewal stacks on the remaining period instead of truncating it.
      const second = await extend(12);
      expect(Date.parse(second.period_start)).toBe(Date.parse(first.period_end));

      const { data: organization, error: readError } = await admin
        .from("organizations")
        .select("selected_plan, proff_access_until")
        .eq("id", otherOrganizationId)
        .single();
      expect(readError).toBeNull();
      expect(organization?.selected_plan).toBe("proff");
      expect(Date.parse(organization!.proff_access_until!)).toBe(Date.parse(second.period_end));

      await admin.from("proff_orders").delete().eq("id", order!.id);
    });

    it("sync_expired_organization_entitlements deactivates members of expired orgs only", async () => {
      const mkUser = async (label: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email: `rls-sync-${label}-${suffix}@example.com`,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        userIds.push(data.user!.id);
        return data.user!.id;
      };
      const mkOrg = async (offset: number, accessUntil: number) => {
        const { data, error } = await admin
          .from("organizations")
          .insert({
            organization_number: String(100_000_000 + ((suffix + offset) % 800_000_000)),
            legal_name: `RLS Sync ${offset} ${suffix}`,
            display_name: `RLS Sync ${offset} ${suffix}`,
            selected_plan: "proff",
            proff_access_until: new Date(accessUntil).toISOString(),
            verification_status: "verified",
          })
          .select("id")
          .single();
        if (error) throw error;
        organizationIds.push(data!.id);
        return data!.id;
      };
      const expiredOrg = await mkOrg(10, Date.now() - 60_000);
      const validOrg = await mkOrg(11, Date.now() + 86_400_000);
      const [expSuper, expMember, valMember] = [
        await mkUser("exp-super"),
        await mkUser("exp-member"),
        await mkUser("val-member"),
      ];
      const { error: insertError } = await admin.from("organization_members").insert([
        { organization_id: expiredOrg, user_id: expSuper, role: "superuser", status: "active" },
        { organization_id: expiredOrg, user_id: expMember, role: "member", status: "active" },
        { organization_id: validOrg, user_id: valMember, role: "member", status: "active" },
      ]);
      expect(insertError).toBeNull();

      const { error } = await admin.rpc("sync_expired_organization_entitlements");
      expect(error).toBeNull();

      const statusOf = async (org: string, user: string) => {
        const { data } = await admin
          .from("organization_members")
          .select("status")
          .eq("organization_id", org)
          .eq("user_id", user)
          .single();
        return data?.status;
      };
      expect(await statusOf(expiredOrg, expMember)).toBe("deactivated");
      expect(await statusOf(expiredOrg, expSuper)).toBe("active");
      expect(await statusOf(validOrg, valMember)).toBe("active");

      const anon = createClient(URL!, ANON_KEY!);
      const { error: anonError } = await anon.rpc("sync_expired_organization_entitlements");
      expect(anonError).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)(
  "RLS: an unverified organization cannot create or publish listings (M-4)",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      owner: `rls-m4-owner-${suffix}@example.com`,
      admin: `rls-m4-admin-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let ownerId: string;
    let organizationId: string;
    let locationId: string;

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
      ownerId = await mkUser(emails.owner);
      await mkUser(emails.admin);
      await admin.from("user_roles").insert({ user_id: userIds[1], role: "admin" });

      const organizationNumber = 200_000_000 + (suffix % 700_000_000);
      const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({
          organization_number: String(organizationNumber),
          legal_name: `RLS M-4 Bedrift ${suffix}`,
          display_name: `RLS M-4 Bedrift ${suffix}`,
          selected_plan: "proff",
          proff_access_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          // No verification_status given — must default to 'unverified'.
        })
        .select("id, verification_status")
        .single();
      if (orgError) throw orgError;
      organizationId = org.id;
      expect(org.verification_status).toBe("unverified");

      const { data: location, error: locationError } = await admin
        .from("organization_locations")
        .insert({
          organization_id: organizationId,
          name: "Hovedlokasjon",
          address_line: "Testgata 1",
          postal_code: "0001",
          city: "Oslo",
          is_default: true,
        })
        .select("id")
        .single();
      if (locationError) throw locationError;
      locationId = location.id;

      const { error: memberError } = await admin.from("organization_members").insert({
        organization_id: organizationId,
        user_id: ownerId,
        role: "superuser",
        status: "active",
      });
      if (memberError) throw memberError;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("organizations").delete().eq("id", organizationId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });

    it("blocks even the organization's own superuser from creating a listing", async () => {
      const owner = await signIn(emails.owner);
      const { error } = await owner.from("listings").insert({
        seller_id: ownerId,
        organization_id: organizationId,
        organization_location_id: locationId,
        title: "M-4 unverified org listing",
        price_nok: 100,
        status: "draft",
      });
      expect(error).not.toBeNull();
    });

    it("keeps direct listing insertion closed after organization verification", async () => {
      const owner = await signIn(emails.owner);
      const { error: selfVerifyError } = await owner.rpc("admin_verify_organization", {
        _organization_id: organizationId,
      });
      expect(selfVerifyError).not.toBeNull();

      const adminUser = await signIn(emails.admin);
      const { error: verifyError } = await adminUser.rpc("admin_verify_organization", {
        _organization_id: organizationId,
      });
      expect(verifyError).toBeNull();

      const { data: org } = await admin
        .from("organizations")
        .select("verification_status, verified_by")
        .eq("id", organizationId)
        .single();
      expect(org?.verification_status).toBe("verified");
      expect(org?.verified_by).toBe(userIds[1]);

      const { error: insertError } = await owner.from("listings").insert({
        seller_id: ownerId,
        organization_id: organizationId,
        organization_location_id: locationId,
        title: "M-4 now-verified org listing",
        price_nok: 100,
        status: "draft",
      });
      expect(insertError).not.toBeNull();
    });
  },
);

describe.skipIf(!canRun)("RLS: organisasjonsdata følger medlems- og superbrukergrensen", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    owner: `rls-org-data-owner-${suffix}@example.com`,
    member: `rls-org-data-member-${suffix}@example.com`,
    outsider: `rls-org-data-outsider-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let organizationId: string;
  let locationId: string;
  let listingId: string;
  let categoryId: string;
  let imageJobId: string;
  let apiKeyId: string;
  const importId = crypto.randomUUID();

  beforeAll(async () => {
    const ownerId = await createRlsUser(admin, emails.owner, userIds);
    const memberId = await createRlsUser(admin, emails.member, userIds);
    await createRlsUser(admin, emails.outsider, userIds);
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .insert({
        organization_number: String(400_000_000 + (suffix % 500_000_000)),
        legal_name: `RLS Org Data ${suffix}`,
        display_name: `RLS Org Data ${suffix}`,
        selected_plan: "proff",
        proff_access_until: new Date(Date.now() + 86_400_000).toISOString(),
        verification_status: "verified",
      })
      .select("id")
      .single();
    if (organizationError) throw organizationError;
    organizationId = organization.id;
    const { data: location, error: locationError } = await admin
      .from("organization_locations")
      .insert({ organization_id: organizationId, name: "RLS lokasjon", is_default: true })
      .select("id")
      .single();
    if (locationError) throw locationError;
    locationId = location.id;
    const { error: membersError } = await admin.from("organization_members").insert([
      { organization_id: organizationId, user_id: ownerId, role: "superuser", status: "active" },
      { organization_id: organizationId, user_id: memberId, role: "member", status: "active" },
    ]);
    if (membersError) throw membersError;
    const { error: locationMemberError } = await admin
      .from("organization_location_members")
      .insert({
        organization_id: organizationId,
        location_id: locationId,
        user_id: memberId,
        role: "member",
      });
    if (locationMemberError) throw locationMemberError;
    categoryId = await createTestCategory(admin, `org-data-${suffix}`);
    const { error: billingError } = await admin.from("organization_billing_profiles").insert({
      organization_id: organizationId,
      billing_email: emails.owner,
    });
    if (billingError) throw billingError;
    const { data: subscription, error: subscriptionError } = await admin
      .from("organization_location_subscriptions")
      .insert({ location_id: locationId, next_period_start: new Date().toISOString() })
      .select("id")
      .single();
    if (subscriptionError) throw subscriptionError;
    const { error: chargeError } = await admin.from("organization_location_charge_periods").insert({
      subscription_id: subscription.id,
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 86_400_000).toISOString(),
      amount_ex_vat_nok: 249,
    });
    if (chargeError) throw chargeError;
    const { error: categoryError } = await admin.from("organization_member_categories").insert({
      organization_id: organizationId,
      user_id: memberId,
      category_id: categoryId,
    });
    if (categoryError) throw categoryError;
    const { error: importError } = await admin.from("organization_listing_imports").insert({
      organization_id: organizationId,
      user_id: memberId,
      import_id: importId,
      external_id: `external-${suffix}`,
      status: "processing",
    });
    if (importError) throw importError;
    const { data: listing, error: listingError } = await admin
      .from("listings")
      .insert({
        seller_id: memberId,
        organization_id: organizationId,
        organization_location_id: locationId,
        title: `RLS visiting address ${suffix}`,
        price_nok: 100,
        status: "active",
        show_visiting_address: true,
      })
      .select("id")
      .single();
    if (listingError) throw listingError;
    listingId = listing.id;
    const { data: imageJob, error: imageJobError } = await admin
      .from("listing_image_jobs")
      .insert({
        organization_id: organizationId,
        listing_id: listingId,
        source_url: `https://example.com/rls-${suffix}.jpg`,
        internal_error: "intern driftsdiagnostikk",
      })
      .select("id")
      .single();
    if (imageJobError) throw imageJobError;
    imageJobId = imageJob.id;
    const { data: apiKey, error: apiKeyError } = await admin
      .from("organization_api_keys")
      .insert({
        organization_id: organizationId,
        created_by: ownerId,
        acting_user_id: ownerId,
        default_location_id: locationId,
        name: "RLS testnøkkel",
        key_prefix: "kpt_live_test",
        key_hash: createHash("sha256").update(`rls-${suffix}`).digest("hex"),
        scopes: ["listings:read"],
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (apiKeyError) throw apiKeyError;
    apiKeyId = apiKey.id;
    const { error: addressError } = await admin.from("listing_visiting_addresses").insert({
      listing_id: listingId,
      address_line: "Testgata 1",
      postal_code: "0001",
      city: "Oslo",
    });
    if (addressError) throw addressError;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listing_image_jobs").delete().eq("id", imageJobId);
    await admin.from("organization_api_keys").delete().eq("id", apiKeyId);
    await admin.from("organizations").delete().eq("id", organizationId);
    await admin.from("r2_delete_queue").delete().like("prefix", `${organizationId}/%`);
    await admin.from("r2_delete_queue").delete().eq("prefix", `${listingId}/`);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  // DB-01/DB-02: reelle SELECT/INSERT/UPDATE/DELETE mot RLS og kolonne-grants.
  it("lar aktive medlemmer se bildekøen, men skjuler internfeil og all klientskriving", async () => {
    const clients = [
      await signInWithRetry(emails.owner),
      await signInWithRetry(emails.member),
      await signInWithRetry(emails.outsider),
      createClient(URL!, ANON_KEY!),
    ];
    for (const [index, client] of clients.entries()) {
      const read = await client.from("listing_image_jobs").select("id").eq("id", imageJobId);
      if (index < 2) {
        expect(read.error).toBeNull();
        expect(read.data).toHaveLength(1);
      } else {
        expect(read.data ?? []).toHaveLength(0);
      }
      const secret = await client
        .from("listing_image_jobs")
        .select("internal_error")
        .eq("id", imageJobId);
      expect(secret.error).not.toBeNull();
      const quotaRead = await client
        .from("organization_daily_quotas")
        .select("organization_id")
        .eq("organization_id", organizationId);
      expect(quotaRead.error).not.toBeNull();
      const quotaWrite = await client.from("organization_daily_quotas").insert({
        organization_id: organizationId,
        usage_date: new Date().toISOString().slice(0, 10),
      });
      expect(quotaWrite.error).not.toBeNull();
      const insert = await client.from("listing_image_jobs").insert({
        organization_id: organizationId,
        listing_id: listingId,
        source_url: `https://example.com/forbidden-${index}-${suffix}.jpg`,
      });
      expect(insert.error).not.toBeNull();
      const update = await client
        .from("listing_image_jobs")
        .update({ status: "done" })
        .eq("id", imageJobId);
      expect(update.error).not.toBeNull();
      const deletion = await client.from("listing_image_jobs").delete().eq("id", imageJobId);
      expect(deletion.error).not.toBeNull();
    }
    const row = await admin
      .from("listing_image_jobs")
      .select("status")
      .eq("id", imageJobId)
      .single();
    expect(row.data?.status).toBe("pending");
  });

  it("lar bare superbruker se API-nøkkelmetadata, aldri hash eller klientskriving", async () => {
    const clients = [
      await signInWithRetry(emails.owner),
      await signInWithRetry(emails.member),
      await signInWithRetry(emails.outsider),
      createClient(URL!, ANON_KEY!),
    ];
    for (const [index, client] of clients.entries()) {
      const read = await client.from("organization_api_keys").select("id").eq("id", apiKeyId);
      if (index === 0) {
        expect(read.error).toBeNull();
        expect(read.data).toHaveLength(1);
      } else {
        expect(read.data ?? []).toHaveLength(0);
      }
      const secret = await client
        .from("organization_api_keys")
        .select("key_hash")
        .eq("id", apiKeyId);
      expect(secret.error).not.toBeNull();
      const insert = await client.from("organization_api_keys").insert({
        organization_id: organizationId,
        created_by: userIds[0],
        acting_user_id: userIds[0],
        default_location_id: locationId,
        name: "Ulovlig nøkkel",
        key_prefix: "kpt_live_no",
        key_hash: createHash("sha256").update(`forbidden-${index}-${suffix}`).digest("hex"),
        scopes: ["listings:read"],
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(insert.error).not.toBeNull();
      const update = await client
        .from("organization_api_keys")
        .update({ name: "Endret" })
        .eq("id", apiKeyId);
      expect(update.error).not.toBeNull();
      const deletion = await client.from("organization_api_keys").delete().eq("id", apiKeyId);
      expect(deletion.error).not.toBeNull();
    }
    const row = await admin
      .from("organization_api_keys")
      .select("name")
      .eq("id", apiKeyId)
      .single();
    expect(row.data?.name).toBe("RLS testnøkkel");
  });

  it("viser private billing/fakturadata bare til superbruker og adresse offentlig når flagget er satt", async () => {
    const owner = await signInWithRetry(emails.owner);
    const member = await signInWithRetry(emails.member);
    const outsider = await signInWithRetry(emails.outsider);
    const anon = createClient(URL!, ANON_KEY!);
    const ownerBilling = await owner
      .from("organization_billing_profiles")
      .select("organization_id")
      .eq("organization_id", organizationId);
    const memberBilling = await member
      .from("organization_billing_profiles")
      .select("organization_id")
      .eq("organization_id", organizationId);
    const ownerSubscription = await owner
      .from("organization_location_subscriptions")
      .select("id")
      .eq("location_id", locationId);
    const memberSubscription = await member
      .from("organization_location_subscriptions")
      .select("id")
      .eq("location_id", locationId);
    const ownerCharge = await owner
      .from("organization_location_charge_periods")
      .select("id")
      .limit(1);
    const memberCharge = await member
      .from("organization_location_charge_periods")
      .select("id")
      .limit(1);
    const outsiderCategories = await outsider
      .from("organization_member_categories")
      .select("category_id")
      .eq("organization_id", organizationId);
    const anonymousAddress = await anon
      .from("listing_visiting_addresses")
      .select("listing_id")
      .eq("listing_id", listingId);
    expect(ownerBilling.error).toBeNull();
    expect(memberBilling.error).toBeNull();
    expect(ownerSubscription.error).toBeNull();
    expect(memberSubscription.error).toBeNull();
    expect(ownerCharge.error).toBeNull();
    expect(memberCharge.error).toBeNull();
    expect(outsiderCategories.error).toBeNull();
    expect(anonymousAddress.error).toBeNull();
    expect(ownerBilling.data).toHaveLength(1);
    expect(memberBilling.data).toHaveLength(0);
    expect(ownerSubscription.data).toHaveLength(1);
    expect(memberSubscription.data).toHaveLength(0);
    expect(ownerCharge.data).toHaveLength(1);
    expect(memberCharge.data).toHaveLength(0);
    expect(outsiderCategories.data).toHaveLength(0);
    expect(anonymousAddress.data).toHaveLength(1);
  });

  it("viser egne medlemskategorier og importstatus til aktivt medlem, men blokkerer klient-skriving", async () => {
    const member = await signInWithRetry(emails.member);
    const memberCategories = await member
      .from("organization_member_categories")
      .select("category_id")
      .eq("organization_id", organizationId);
    const imports = await member
      .from("organization_listing_imports")
      .select("import_id")
      .eq("organization_id", organizationId);
    expect(memberCategories.data).toHaveLength(1);
    expect(imports.data).toHaveLength(1);
    const { error: billingWrite } = await member
      .from("organization_billing_profiles")
      .update({ billing_email: emails.member })
      .eq("organization_id", organizationId);
    const { error: categoryWrite } = await member
      .from("organization_member_categories")
      .insert({ organization_id: organizationId, user_id: userIds[1], category_id: categoryId });
    const { error: importWrite } = await member.from("organization_listing_imports").insert({
      organization_id: organizationId,
      user_id: userIds[1],
      import_id: crypto.randomUUID(),
      external_id: "client",
      status: "processing",
    });
    const { error: addressWrite } = await member
      .from("listing_visiting_addresses")
      .insert({ listing_id: listingId, address_line: "Hacket", postal_code: "0001", city: "Oslo" });
    expect(billingWrite).not.toBeNull();
    expect(categoryWrite).not.toBeNull();
    expect(importWrite).not.toBeNull();
    expect(addressWrite).not.toBeNull();
    const { error: serviceUpdate } = await admin
      .from("organization_billing_profiles")
      .update({ billing_email: emails.owner })
      .eq("organization_id", organizationId);
    expect(serviceUpdate).toBeNull();
  });

  it("eksponerer kun valgt kontaktinfo for aktive annonser via listing_business_contact", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { error: locationUpdate } = await admin
      .from("organization_locations")
      .update({
        address_line: "Testgata 1",
        postal_code: "0001",
        city: "Oslo",
        show_visiting_address: true,
        visiting_lat: 59.9,
        visiting_lng: 10.7,
      })
      .eq("id", locationId);
    expect(locationUpdate).toBeNull();
    const { error: contactsError } = await admin.from("organization_location_contacts").insert([
      {
        location_id: locationId,
        organization_id: organizationId,
        name: "Synlig selger",
        phone: "12345678",
        avatar_path: `${organizationId}/contact-test.webp`,
        // Satt eksplisitt: i en bulk-insert med ulike nøkler fyller PostgREST
        // manglende kolonner med NULL i stedet for kolonnens standardverdi.
        show_in_listings: true,
        sort_order: 0,
      },
      {
        location_id: locationId,
        organization_id: organizationId,
        name: "Skjult selger",
        phone: "87654321",
        show_in_listings: false,
        sort_order: 1,
      },
    ]);
    expect(contactsError).toBeNull();

    const direct = await anon
      .from("organization_location_contacts")
      .select("id")
      .eq("location_id", locationId);
    expect(direct.error).not.toBeNull();

    const { data, error } = await anon.rpc("listing_business_contact", { _listing_id: listingId });
    expect(error).toBeNull();
    const contact = data as {
      visiting_address: { address_line: string; lat: number } | null;
      contacts: { name: string; phone: string; avatar_path: string | null }[];
    };
    expect(contact.visiting_address).toMatchObject({ address_line: "Testgata 1", lat: 59.9 });
    expect(contact.contacts).toEqual([
      expect.objectContaining({
        name: "Synlig selger",
        phone: "12345678",
        avatar_path: `${organizationId}/contact-test.webp`,
      }),
    ]);

    // Uten Proff skjules profilbildet, og uten flagget skjules adressen.
    await admin
      .from("organizations")
      .update({ proff_access_until: new Date(Date.now() - 1000).toISOString() })
      .eq("id", organizationId);
    await admin
      .from("organization_locations")
      .update({ show_visiting_address: false })
      .eq("id", locationId);
    const withoutProff = await anon.rpc("listing_business_contact", { _listing_id: listingId });
    const reduced = withoutProff.data as typeof contact;
    expect(reduced.visiting_address).toBeNull();
    expect(reduced.contacts[0]?.avatar_path).toBeNull();

    // Ikke-aktive annonser gir ingen kontaktinfo til anonyme.
    await admin.from("listings").update({ status: "draft" }).eq("id", listingId);
    const draft = await anon.rpc("listing_business_contact", { _listing_id: listingId });
    expect(draft.data).toBeNull();

    await admin.from("listings").update({ status: "active" }).eq("id", listingId);
    await admin
      .from("organizations")
      .update({ proff_access_until: new Date(Date.now() + 86_400_000).toISOString() })
      .eq("id", organizationId);
  });
});

// Deletes the categories created by createTestCategory() above. Registered last so
// it runs after the block-local afterAll hooks (see rls-test-helpers.ts).
registerCategoryCleanup();
