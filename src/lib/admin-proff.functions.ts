import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole as requireAdmin } from "@/lib/admin-auth.server";
import { PROFF_TERMS, type ProffTerm } from "@/features/business-account/plans";

const ORDER_SELECT =
  "id, organization_id, term, status, price_ex_vat_nok, billing_email, billing_reference, fiken_invoice_number, period_start, period_end, admin_note, created_at, updated_at";

export type AdminProffOrder = {
  id: string;
  organization_id: string;
  term: ProffTerm;
  status: "pending" | "invoiced" | "paid" | "cancelled";
  price_ex_vat_nok: number;
  billing_email: string;
  billing_reference: string | null;
  fiken_invoice_number: string | null;
  period_start: string | null;
  period_end: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  organization: {
    display_name: string;
    legal_name: string;
    organization_number: string;
    proff_access_until: string | null;
  } | null;
};

const uuid = z.string().uuid();

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const adminListProffOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        status: z.enum(["pending", "invoiced", "paid", "cancelled"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getAdminClient();
    let query = supabaseAdmin
      .from("proff_orders")
      .select(
        `${ORDER_SELECT}, organization:organizations(display_name, legal_name, organization_number, proff_access_until)`,
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) query = query.eq("status", data.status);
    const { data: orders, error } = await query;
    if (error) throw error;
    return (orders ?? []) as unknown as AdminProffOrder[];
  });

export const adminMarkProffOrderInvoiced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orderId: uuid,
        fikenInvoiceNumber: z.string().trim().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getAdminClient();
    const { data: updated, error } = await supabaseAdmin
      .from("proff_orders")
      .update({ status: "invoiced", fiken_invoice_number: data.fikenInvoiceNumber })
      .eq("id", data.orderId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new Error("Bestillingen er ikke lenger til fakturering.");
    return { ok: true };
  });

export const adminMarkProffOrderPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ orderId: uuid, fikenInvoiceNumber: z.string().trim().max(40).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getAdminClient();

    // Claim the order first: the status filter is what makes a double click idempotent,
    // so access can never be extended twice for the same payment.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("proff_orders")
      .update({
        status: "paid",
        ...(data.fikenInvoiceNumber && { fiken_invoice_number: data.fikenInvoiceNumber }),
      })
      .eq("id", data.orderId)
      .in("status", ["pending", "invoiced"])
      .select("id, organization_id, term")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw new Error("Bestillingen er allerede registrert betalt eller kansellert.");

    const { data: period, error: extendError } = await supabaseAdmin
      .rpc("extend_proff_access", {
        _organization_id: claimed.organization_id,
        _months: PROFF_TERMS[claimed.term as ProffTerm].months,
      })
      .single();
    if (extendError) throw extendError;

    const { error: periodError } = await supabaseAdmin
      .from("proff_orders")
      .update({ period_start: period.period_start, period_end: period.period_end })
      .eq("id", claimed.id);
    if (periodError) throw periodError;

    return { ok: true, periodStart: period.period_start, periodEnd: period.period_end };
  });

export const adminCancelProffOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ orderId: uuid, note: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getAdminClient();
    const { data: cancelled, error } = await supabaseAdmin
      .from("proff_orders")
      .update({ status: "cancelled", admin_note: data.note || null })
      .eq("id", data.orderId)
      .in("status", ["pending", "invoiced"])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!cancelled) throw new Error("Bestillingen kan ikke kanselleres.");
    return { ok: true };
  });

export type AdminLocationCharge = {
  subscription_id: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  amount_ex_vat_nok: number;
  billing_email: string;
  legal_name: string;
  display_name: string;
  fiken_invoice_number: string | null;
};

export const adminListLocationCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getAdminClient();
    const { data, error } = await supabaseAdmin
      .from("organization_location_subscriptions")
      .select(
        "id, location_id, billing_interval_months, unit_price_ex_vat_nok, next_period_start, organization_locations!inner(organization_id, name, organizations!inner(display_name, legal_name))",
      )
      .lte("next_period_start", new Date().toISOString())
      .order("next_period_start");
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      location_id: string;
      billing_interval_months: number;
      unit_price_ex_vat_nok: number;
      next_period_start: string;
      organization_locations: {
        organization_id: string;
        name: string;
        organizations: { display_name: string; legal_name: string } | null;
      };
    }>;
    const organizationIds = [
      ...new Set(rows.map((row) => row.organization_locations.organization_id)),
    ];
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("organization_billing_profiles")
      .select("organization_id, billing_email")
      .in("organization_id", organizationIds);
    if (profilesError) throw profilesError;
    const billingEmails = new Map(
      (profiles ?? []).map((profile) => [profile.organization_id, profile.billing_email]),
    );
    return rows.map((row) => {
      const periodStart = new Date(row.next_period_start);
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + row.billing_interval_months);
      const organization = row.organization_locations.organizations;
      return {
        subscription_id: row.id,
        location_id: row.location_id,
        location_name: row.organization_locations.name,
        organization_id: row.organization_locations.organization_id,
        period_start: row.next_period_start,
        period_end: periodEnd.toISOString(),
        amount_ex_vat_nok: row.unit_price_ex_vat_nok * row.billing_interval_months,
        billing_email: billingEmails.get(row.organization_locations.organization_id) ?? "",
        legal_name: organization?.legal_name ?? "",
        display_name: organization?.display_name ?? "",
        fiken_invoice_number: null,
      };
    }) satisfies AdminLocationCharge[];
  });

export const adminMarkLocationChargeInvoiced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        subscriptionId: uuid,
        periodStart: z.string().datetime(),
        fikenInvoiceNumber: z.string().trim().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getAdminClient();
    const { data: period, error } = await supabaseAdmin.rpc(
      "mark_organization_location_charge_invoiced",
      {
        _subscription_id: data.subscriptionId,
        _period_start: data.periodStart,
        _fiken_invoice_number: data.fikenInvoiceNumber,
      },
    );
    if (error) throw error;
    return {
      period: period
        ? {
            id: String((period as { id: string }).id),
            subscription_id: String((period as { subscription_id: string }).subscription_id),
            period_start: String((period as { period_start: string }).period_start),
            period_end: String((period as { period_end: string }).period_end),
            amount_ex_vat_nok: Number((period as { amount_ex_vat_nok: number }).amount_ex_vat_nok),
            fiken_invoice_number: (period as { fiken_invoice_number: string | null })
              .fiken_invoice_number,
            invoiced_at: String((period as { invoiced_at: string }).invoiced_at),
          }
        : null,
    };
  });
