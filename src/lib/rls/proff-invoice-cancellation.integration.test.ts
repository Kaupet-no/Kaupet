import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { URL, SERVICE_ROLE_KEY, canRun } from "../rls-test-helpers";

describe.skipIf(!canRun)("Proff: oppsigelse før neste faktura opprettes", () => {
  const service = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const organizationId = randomUUID();

  afterAll(async () => {
    if (!canRun) return;
    const events = await service.from("admin_events").delete().eq("target_id", organizationId);
    expect(events.error).toBeNull();
    const org = await service.from("organizations").delete().eq("id", organizationId);
    expect(org.error).toBeNull();
  });

  it("lukker utsendingsvarselet og varsler på nytt når kunden angrer", async () => {
    const organization = await service.from("organizations").insert({
      id: organizationId,
      organization_number: String(Date.now()).slice(-9),
      legal_name: "Oppsigelsestest AS",
      display_name: "Oppsigelsestest",
      selected_plan: "proff",
      proff_access_until: new Date(Date.now() + 10 * 864e5).toISOString(),
    });
    expect(organization.error).toBeNull();
    const order = await service.from("proff_orders").insert({
      organization_id: organizationId,
      term: "monthly",
      price_ex_vat_nok: 1490,
      billing_email: "faktura@example.com",
      status: "paid",
    });
    expect(order.error).toBeNull();
    const openEvents = () =>
      service
        .from("admin_events")
        .select("id")
        .eq("target_id", organizationId)
        .eq("kind", "proff_invoice_due")
        .is("handled_at", null);
    expect((await service.rpc("create_proff_billing_events")).error).toBeNull();
    expect((await openEvents()).data).toHaveLength(1);
    const cancel = await service
      .from("organizations")
      .update({ proff_subscription_cancelled_at: new Date().toISOString() })
      .eq("id", organizationId);
    expect(cancel.error).toBeNull();
    expect((await openEvents()).data).toEqual([]);
    expect((await service.rpc("create_proff_billing_events")).error).toBeNull();
    expect((await openEvents()).data).toEqual([]);
    const resume = await service
      .from("organizations")
      .update({ proff_subscription_cancelled_at: null })
      .eq("id", organizationId);
    expect(resume.error).toBeNull();
    expect((await service.rpc("create_proff_billing_events")).error).toBeNull();
    expect((await openEvents()).data).toHaveLength(1);
  });
});
