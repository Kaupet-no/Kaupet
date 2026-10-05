/** RLS integration tests: admin_events inbox. Shared helpers live in ../rls-test-helpers.ts; run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  SERVICE_ROLE_KEY,
  canRun,
  createRlsUser,
  signInWithRetry,
  grantAdmin,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("RLS: admin_events is admin-only and fed by triggers", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    admin: `rls-events-admin-${suffix}@example.com`,
    user: `rls-events-user-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  const targetIds: string[] = [];
  let adminId: string;
  let userId: string;
  let listingId: string;
  let orgId: string;

  async function eventsFor(targetId: string) {
    const { data, error } = await admin
      .from("admin_events")
      .select("kind, handled_at, handled_by")
      .eq("target_id", targetId)
      .order("created_at");
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    adminId = await createRlsUser(admin, emails.admin, userIds);
    userId = await createRlsUser(admin, emails.user, userIds);
    await grantAdmin(admin, adminId);
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Admin events listing",
        price_nok: 100,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = listing.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("admin_events").delete().in("target_id", targetIds);
    await admin.from("reports").delete().eq("listing_id", listingId);
    await admin.from("listings").delete().eq("id", listingId);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("opens an event per report, hides it from non-admins and closes it on resolve", async () => {
    const { data: report, error } = await admin
      .from("reports")
      .insert({ listing_id: listingId, reporter_id: userId, reason: "Svindel" })
      .select("id")
      .single();
    if (error) throw error;
    targetIds.push(report.id);
    expect(await eventsFor(report.id)).toEqual([
      { kind: "listing_reported", handled_at: null, handled_by: null },
    ]);

    const user = await signInWithRetry(emails.user);
    const { data: hidden } = await user
      .from("admin_events")
      .select("id")
      .eq("target_id", report.id);
    expect(hidden).toEqual([]);
    const { data: forged } = await user
      .from("admin_events")
      .update({ handled_at: new Date().toISOString() })
      .eq("target_id", report.id)
      .select("id");
    expect(forged ?? []).toEqual([]);

    const adminClient = await signInWithRetry(emails.admin);
    const { data: visible } = await adminClient
      .from("admin_events")
      .select("id")
      .eq("target_id", report.id);
    expect(visible).toHaveLength(1);

    await admin
      .from("reports")
      .update({ status: "resolved", resolved_by: adminId, resolved_at: new Date().toISOString() })
      .eq("id", report.id);
    const [closed] = await eventsFor(report.id);
    expect(closed.handled_at).not.toBeNull();
    expect(closed.handled_by).toBe(adminId);
  });

  it("tracks organization registration, verification and trial cancellation", async () => {
    const now = Date.now();
    const { data: org, error } = await admin
      .from("organizations")
      .insert({
        organization_number: String(suffix).slice(-9).padStart(9, "1"),
        legal_name: "Hendelse AS",
        display_name: "Hendelse",
      })
      .select("id")
      .single();
    if (error) throw error;
    orgId = org.id;
    targetIds.push(org.id);

    await admin
      .from("organizations")
      .update({ verification_status: "verified", verified_by: adminId })
      .eq("id", org.id);
    const ends = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from("organizations")
      .update({
        selected_plan: "proff",
        proff_trial_started_at: new Date(now).toISOString(),
        proff_trial_ends_at: ends,
        proff_access_until: ends,
      })
      .eq("id", org.id);
    await admin
      .from("organizations")
      .update({
        selected_plan: "proff_basis",
        proff_trial_cancelled_at: new Date(now + 1000).toISOString(),
        proff_access_until: new Date(now + 1000).toISOString(),
      })
      .eq("id", org.id);

    const events = await eventsFor(org.id);
    expect(events.map((e) => [e.kind, e.handled_at !== null])).toEqual([
      ["organization_registered", true],
      // Prøvestart varsles fra bestillingen (start_proff_trial_order), ikke herfra.
      ["proff_cancelled", false],
    ]);
  });

  it("opens an event per category suggestion and closes it when deleted", async () => {
    const { data: fb, error } = await admin
      .from("feedback")
      .insert({ type: "kategori", message: "Forslag", category_name: "Akvarier" })
      .select("id")
      .single();
    if (error) throw error;
    targetIds.push(fb.id);
    expect((await eventsFor(fb.id)).map((e) => e.kind)).toEqual(["category_suggestion"]);
    await admin.from("feedback").delete().eq("id", fb.id);
    const [closed] = await eventsFor(fb.id);
    expect(closed.handled_at).not.toBeNull();
  });
});

describe.skipIf(!canRun)("Proff: manuell fakturering av løpende abonnement", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let userId: string;
  const osloDate = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const addDays = (iso: string, days: number) =>
    osloDate(new Date(Date.parse(`${iso}T12:00:00Z`) + days * 864e5));

  async function newOrg(n: number) {
    const { data, error } = await admin
      .from("organizations")
      .insert({
        organization_number: String(suffix + n).slice(-9),
        legal_name: `Faktura ${n} AS`,
        display_name: `Faktura ${n}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    orgIds.push(data.id);
    const { error: billingError } = await admin
      .from("organization_billing_profiles")
      .insert({ organization_id: data.id, billing_email: `faktura-${n}@example.com` });
    if (billingError) throw billingError;
    return data.id;
  }

  async function startTrial(orgId: string) {
    const { data: orderId, error } = await admin.rpc("start_proff_trial_order", {
      _organization_id: orgId,
      _requested_by: userId,
      _term: "monthly",
      _price_ex_vat_nok: 1490,
      _billing_email: "faktura@example.com",
    });
    if (error) throw error;
    return orderId as string;
  }

  async function upcomingFor(orgId: string) {
    const { data, error } = await admin.rpc("admin_proff_upcoming_invoices");
    if (error) throw error;
    return ((data ?? []) as { organization_id: string }[]).filter(
      (row) => row.organization_id === orgId,
    );
  }

  async function events(targetId: string) {
    const { data } = await admin
      .from("admin_events")
      .select("kind, title, handled_at")
      .eq("target_id", targetId)
      .order("created_at");
    return data ?? [];
  }

  beforeAll(async () => {
    userId = await createRlsUser(admin, `rls-invoice-${suffix}@example.com`, userIds);
  });

  afterAll(async () => {
    if (!canRun) return;
    const { data: orders } = await admin
      .from("proff_orders")
      .select("id")
      .in("organization_id", orgIds);
    await admin
      .from("admin_events")
      .delete()
      .in("target_id", [...orgIds, ...(orders ?? []).map((o) => o.id)]);
    await admin.from("organizations").delete().in("id", orgIds);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("første faktura har forfall når prøven utløper og skal sendes 14 dager før", async () => {
    const orgId = await newOrg(1);
    const orderId = await startTrial(orgId);
    await expect(startTrial(orgId)).rejects.toMatchObject({ message: "trial_used" });

    const { data: org } = await admin
      .from("organizations")
      .select("proff_trial_ends_at")
      .eq("id", orgId)
      .single();
    const due = osloDate(new Date(org!.proff_trial_ends_at!));
    const [upcoming] = await upcomingFor(orgId);
    expect(upcoming).toMatchObject({ order_id: orderId, due_on: due, send_by: addDays(due, -14) });

    const [trialEvent] = await events(orderId);
    expect(trialEvent.kind).toBe("proff_trial_started");
    expect(trialEvent.title).toContain("send faktura innen");

    // Sendt: forsvinner fra utsendingslista, og hendelsen lukkes.
    await admin
      .from("proff_orders")
      .update({
        status: "invoiced",
        fiken_invoice_number: "10001",
        invoice_sent_on: addDays(due, -21),
        invoice_due_on: due,
      })
      .eq("id", orderId);
    expect(await upcomingFor(orgId)).toEqual([]);
    expect((await events(orderId))[0].handled_at).not.toBeNull();
  });

  it("varsler om forfalt faktura og lukker varselet når påminnelse er sendt", async () => {
    const orgId = await newOrg(2);
    const orderId = await startTrial(orgId);
    const yesterday = addDays(osloDate(new Date()), -1);
    await admin
      .from("proff_orders")
      .update({
        status: "invoiced",
        fiken_invoice_number: "10002",
        invoice_sent_on: addDays(yesterday, -14),
        invoice_due_on: yesterday,
      })
      .eq("id", orderId);

    await admin.rpc("create_proff_billing_events");
    await admin.rpc("create_proff_billing_events");
    const overdue = (await events(orderId)).filter((e) => e.kind === "proff_payment_overdue");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].title).toContain("10002");

    await admin
      .from("proff_orders")
      .update({ reminder_sent_on: osloDate(new Date()) })
      .eq("id", orderId);
    const [handled] = (await events(orderId)).filter((e) => e.kind === "proff_payment_overdue");
    expect(handled.handled_at).not.toBeNull();
  });

  it("varsler om neste faktura i løpende abonnement og lukker varselet når den er sendt", async () => {
    const orgId = await newOrg(3);
    const orderId = await startTrial(orgId);
    // Betalt første periode som slutter om 10 dager: neste faktura er allerede forsinket.
    const accessUntil = new Date(Date.now() + 10 * 864e5).toISOString();
    await admin
      .from("proff_orders")
      .update({ status: "paid", paid_on: osloDate(new Date()) })
      .eq("id", orderId);
    await admin.from("organizations").update({ proff_access_until: accessUntil }).eq("id", orgId);

    const [next] = await upcomingFor(orgId);
    expect(next).toMatchObject({
      order_id: null,
      term: "monthly",
      due_on: osloDate(new Date(accessUntil)),
    });

    await admin.rpc("create_proff_billing_events");
    const dueEvents = async () =>
      (await events(orgId)).filter((e) => e.kind === "proff_invoice_due");
    const [due] = await dueEvents();
    expect(due).toMatchObject({ kind: "proff_invoice_due", handled_at: null });
    expect(due.title).toContain("Send Proff-faktura (månedlig)");

    const { error } = await admin.from("proff_orders").insert({
      organization_id: orgId,
      term: "monthly",
      price_ex_vat_nok: 1490,
      billing_email: "faktura@example.com",
      status: "invoiced",
      fiken_invoice_number: "10003",
      invoice_sent_on: osloDate(new Date()),
      invoice_due_on: osloDate(new Date(accessUntil)),
    });
    expect(error).toBeNull();
    expect((await dueEvents())[0].handled_at).not.toBeNull();
    expect(await upcomingFor(orgId)).toEqual([]);
  });

  it("oppsagt abonnement får ingen ny faktura, og admin varsles om oppsigelsen", async () => {
    const orgId = await newOrg(4);
    const orderId = await startTrial(orgId);
    const accessUntil = new Date(Date.now() + 10 * 864e5).toISOString();
    await admin
      .from("proff_orders")
      .update({ status: "paid", paid_on: osloDate(new Date()) })
      .eq("id", orderId);
    await admin.from("organizations").update({ proff_access_until: accessUntil }).eq("id", orgId);
    expect(await upcomingFor(orgId)).toHaveLength(1);

    await admin
      .from("organizations")
      .update({ proff_subscription_cancelled_at: new Date().toISOString() })
      .eq("id", orgId);
    expect(await upcomingFor(orgId)).toEqual([]);
    const cancelled = (await events(orgId)).filter((e) => e.kind === "proff_cancelled");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].title).toContain("sa opp Proff – løper ut");

    // Angret: abonnementet løper videre, og oppsigelsen er fulgt opp.
    await admin
      .from("organizations")
      .update({ proff_subscription_cancelled_at: null })
      .eq("id", orgId);
    expect(await upcomingFor(orgId)).toHaveLength(1);
    const [handled] = (await events(orgId)).filter((e) => e.kind === "proff_cancelled");
    expect(handled.handled_at).not.toBeNull();
  });
});
