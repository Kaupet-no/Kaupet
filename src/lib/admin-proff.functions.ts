import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { ClientError, toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole as requireAdmin } from "@/lib/admin-auth.server";
import { PROFF_TERMS, type ProffTerm } from "@/features/business-account/plans";
import { proffEndedByKaupetEmail, proffPaidEmail } from "@/lib/business-email-templates";
import { sendBusinessReceipt } from "@/lib/business/business-emails.server";

const ORDER_SELECT =
  "id, organization_id, term, status, price_ex_vat_nok, billing_email, billing_reference, fiken_invoice_number, invoice_sent_on, invoice_due_on, reminder_sent_on, paid_on, period_start, period_end, admin_note, created_at, updated_at";

export type AdminProffOrder = {
  id: string;
  organization_id: string;
  term: ProffTerm;
  status: "pending" | "invoiced" | "paid" | "cancelled";
  price_ex_vat_nok: number;
  billing_email: string;
  billing_reference: string | null;
  fiken_invoice_number: string | null;
  invoice_sent_on: string | null;
  invoice_due_on: string | null;
  reminder_sent_on: string | null;
  paid_on: string | null;
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
    proff_trial_ends_at: string | null;
    proff_trial_cancelled_at: string | null;
  } | null;
};

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ugyldig dato");
const invoiceNumber = z.string().trim().min(1).max(40);

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
    const supabaseAdmin = await getSupabaseAdmin();
    let query = supabaseAdmin
      .from("proff_orders")
      .select(
        `${ORDER_SELECT}, organization:organizations(display_name, legal_name, organization_number, proff_access_until, proff_trial_ends_at, proff_trial_cancelled_at)`,
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) query = query.eq("status", data.status);
    const { data: orders, error } = await query;
    if (error) {
      throw await toClientError("database", error);
    }
    return (orders ?? []) as unknown as AdminProffOrder[];
  });

export type AdminProffUpcomingInvoice = {
  organization_id: string;
  order_id: string | null;
  term: ProffTerm;
  period_start: string | null;
  due_on: string;
  send_by: string;
  legal_name: string;
  organization_number: string;
  billing_email: string;
  trial_ends_at: string | null;
};

/** Fakturaer som skal sendes: prøvebestillinger og neste periode i løpende abonnement. */
export const adminListProffUpcomingInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: rows, error } = await supabaseAdmin.rpc("admin_proff_upcoming_invoices");
    if (error) {
      throw await toClientError("database", error);
    }
    const ids = [...new Set((rows ?? []).map((row) => row.organization_id))];
    if (ids.length === 0) return [] as AdminProffUpcomingInvoice[];
    const [orgs, profiles] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id, legal_name, organization_number, proff_trial_ends_at")
        .in("id", ids),
      supabaseAdmin
        .from("organization_billing_profiles")
        .select("organization_id, billing_email")
        .in("organization_id", ids),
    ]);
    if (orgs.error) throw await toClientError("database", orgs.error);
    if (profiles.error) throw await toClientError("database", profiles.error);
    const orgById = new Map((orgs.data ?? []).map((org) => [org.id, org]));
    const emailById = new Map(
      (profiles.data ?? []).map((profile) => [profile.organization_id, profile.billing_email]),
    );
    return (rows ?? [])
      .map((row) => {
        const org = orgById.get(row.organization_id);
        return {
          ...row,
          term: row.term as ProffTerm,
          legal_name: org?.legal_name ?? "",
          organization_number: org?.organization_number ?? "",
          billing_email: emailById.get(row.organization_id) ?? "",
          trial_ends_at: org?.proff_trial_ends_at ?? null,
        };
      })
      .sort((a, b) => a.send_by.localeCompare(b.send_by)) satisfies AdminProffUpcomingInvoice[];
  });

/**
 * Admin har sendt fakturaen fra Fiken. Enten for en åpen bestilling (orderId),
 * eller for neste periode i et løpende abonnement (organizationId + term), som
 * da opprettes her med perioden fra der betalt tilgang slutter.
 */
export const adminRegisterProffInvoiceSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orderId: uuid.optional(),
        organizationId: uuid.optional(),
        term: z.enum(["monthly", "yearly"]).optional(),
        fikenInvoiceNumber: invoiceNumber,
        sentOn: isoDate,
        dueOn: isoDate,
      })
      .refine((v) => v.dueOn >= v.sentOn, "Forfall kan ikke være før sendt dato.")
      .refine(
        (v) => Boolean(v.orderId) !== Boolean(v.organizationId && v.term),
        "Oppgi enten bestilling eller bedrift og periode.",
      )
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const term = data.term ? PROFF_TERMS[data.term] : undefined;
    const { error } = await supabaseAdmin.rpc("register_proff_invoice_sent", {
      _invoice_number: data.fikenInvoiceNumber,
      _sent_on: data.sentOn,
      _due_on: data.dueOn,
      _order_id: data.orderId,
      _organization_id: data.organizationId,
      _term: term?.id,
      _price_ex_vat_nok: term?.priceExVatNok,
      _requested_by: context.userId,
    });
    if (error) {
      if (error.message?.includes("order_not_invoiceable")) {
        throw new ClientError("Bestillingen er ikke lenger til fakturering.", 409);
      }
      if (error.message?.includes("agreement_not_renewable")) {
        throw new ClientError(
          "Avtalen er sagt opp, avsluttet eller ikke aktiv. Oppdater oversikten.",
          409,
        );
      }
      if (error.code === "23505") {
        throw new ClientError("Bedriften har allerede en åpen faktura.", 409);
      }
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminRegisterProffReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderId: uuid, sentOn: isoDate }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: updated, error } = await supabaseAdmin
      .from("proff_orders")
      .update({ reminder_sent_on: data.sentOn })
      .eq("id", data.orderId)
      .eq("status", "invoiced")
      .select("id")
      .maybeSingle();
    if (error) {
      throw await toClientError("database", error);
    }
    if (!updated) throw new ClientError("Fakturaen er ikke lenger ubetalt.", 409);
    return { ok: true };
  });

export const adminMarkProffOrderPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        orderId: uuid,
        paidOn: isoDate,
        fikenInvoiceNumber: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: payment, error } = await supabaseAdmin
      .rpc("mark_proff_order_paid", {
        _order_id: data.orderId,
        _paid_on: data.paidOn,
        _fiken_invoice_number: data.fikenInvoiceNumber,
      })
      .single();
    if (error) {
      if (error.message?.includes("order_not_payable")) {
        throw new ClientError("Bestillingen er allerede registrert betalt eller kansellert.", 409);
      }
      throw await toClientError("database", error);
    }

    await sendPaymentReceipt(supabaseAdmin, {
      organizationId: payment.organization_id,
      firstPeriod: payment.first_period,
      term: payment.term as ProffTerm,
      invoiceNumber: payment.fiken_invoice_number,
      periodStart: payment.period_start,
      periodEnd: payment.period_end,
    });

    return { ok: true, periodStart: payment.period_start, periodEnd: payment.period_end };
  });

async function sendPaymentReceipt(
  supabaseAdmin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  params: {
    organizationId: string;
    firstPeriod: boolean;
    term: ProffTerm;
    invoiceNumber: string | null;
    periodStart: string;
    periodEnd: string;
  },
) {
  if (!params.firstPeriod) {
    const { data: profile } = await supabaseAdmin
      .from("organization_billing_profiles")
      .select("payment_receipts")
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (!profile?.payment_receipts) return;
  }
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("display_name, legal_name")
    .eq("id", params.organizationId)
    .maybeSingle();
  if (!org) return;
  await sendBusinessReceipt(
    supabaseAdmin,
    params.organizationId,
    () =>
      proffPaidEmail({
        displayName: org.display_name,
        legalName: org.legal_name,
        firstPeriod: params.firstPeriod,
        term: params.term,
        invoiceNumber: params.invoiceNumber,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      }),
    { includeBilling: true },
  );
}

/**
 * Kaupet avslutter Proff-avtalen. Åpne fakturaer kanselleres, det lages ingen
 * nye (proff_subscription_cancelled_at), og Proff varer ut perioden som er
 * betalt — tilgangen røres ikke. Bedriften får e-post med fast tekst; notatet
 * er internt. Skiller seg fra adminCancelProffOrder, som bare retter én faktura.
 */
export const adminEndProffAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ organizationId: uuid, note: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();

    // Fakturaer, avtalestatus, hendelse og logg lagres atomisk. claimed er
    // false når avtalen allerede var avsluttet (dobbeltklikk): da sendes ingen ny e-post.
    const { data: ended, error } = await supabaseAdmin
      .rpc("end_proff_agreement", {
        _organization_id: data.organizationId,
        _admin_id: context.userId,
        _note: data.note,
      })
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    if (!ended.claimed) return { ok: true, accessUntil: ended.access_until };

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("display_name, legal_name")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (org) {
      await sendBusinessReceipt(
        supabaseAdmin,
        data.organizationId,
        () =>
          proffEndedByKaupetEmail({
            displayName: org.display_name,
            legalName: org.legal_name,
            accessUntil: ended.access_until,
            overdueInvoice:
              ended.overdue_invoice_number && ended.overdue_due_on
                ? { number: ended.overdue_invoice_number, dueOn: ended.overdue_due_on }
                : null,
            creditedInvoiceNumber: ended.credited_invoice_number,
          }),
        { includeBilling: true },
      );
    }

    return { ok: true, accessUntil: ended.access_until };
  });

export const adminCancelProffOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ orderId: uuid, note: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: cancelled, error } = await supabaseAdmin
      .from("proff_orders")
      .update({ status: "cancelled", admin_note: data.note || null })
      .eq("id", data.orderId)
      .in("status", ["pending", "invoiced"])
      .select("id")
      .maybeSingle();
    if (error) {
      throw await toClientError("database", error);
    }
    if (!cancelled) throw new ClientError("Bestillingen kan ikke kanselleres.", 409);
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
    const supabaseAdmin = await getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("organization_location_subscriptions")
      .select(
        "id, location_id, billing_interval_months, unit_price_ex_vat_nok, next_period_start, organization_locations!inner(organization_id, name, organizations!inner(display_name, legal_name))",
      )
      .lte("next_period_start", new Date().toISOString())
      .order("next_period_start");
    if (error) {
      throw await toClientError("database", error);
    }
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
    if (profilesError) {
      throw await toClientError("database", profilesError);
    }
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
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: period, error } = await supabaseAdmin.rpc(
      "mark_organization_location_charge_invoiced",
      {
        _subscription_id: data.subscriptionId,
        _period_start: data.periodStart,
        _fiken_invoice_number: data.fikenInvoiceNumber,
      },
    );
    if (error) {
      throw await toClientError("database", error);
    }
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
