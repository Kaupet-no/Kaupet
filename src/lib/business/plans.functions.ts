import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROFF_TERMS, type ProffTerm } from "@/features/business-account/plans";
import {
  getOrganization,
  hasEffectiveProffAccess,
  requireSuperuserOrganization,
  type AdminClient,
} from "@/lib/business/organization-access";
import { describeSafeError } from "@/lib/safe-error";
import { toClientError } from "@/lib/to-client-error";

const planSchema = z.enum(["proff_basis", "proff"]);
const USED_TRIAL_MESSAGE =
  "Prøveperioden er brukt. Bestill Proff for å fortsette med de betalte funksjonene.";

export const setBusinessPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ plan: planSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const current = await getOrganization(supabaseAdmin, organizationId);
    const now = new Date();

    if (data.plan === "proff") {
      if (current.proff_trial_started_at) {
        const hasAccess = await hasEffectiveProffAccess(supabaseAdmin, organizationId);
        if (current.selected_plan === "proff" && hasAccess) {
          return { organization: current };
        }
        throw new Error(USED_TRIAL_MESSAGE);
      }
      const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { error } = await supabaseAdmin
        .from("organizations")
        .update({
          selected_plan: "proff",
          proff_trial_started_at: now.toISOString(),
          proff_trial_ends_at: trialEnds.toISOString(),
          proff_access_until: trialEnds.toISOString(),
          proff_trial_cancelled_at: null,
        })
        .eq("id", organizationId)
        .is("proff_trial_started_at", null);
      if (error) {
        throw await toClientError("database", error);
      }
    } else {
      const hasAccess =
        current.selected_plan === "proff" &&
        (await hasEffectiveProffAccess(supabaseAdmin, organizationId));
      const updates = hasAccess
        ? {
            selected_plan: "proff_basis",
            proff_trial_cancelled_at: now.toISOString(),
            proff_access_until: now.toISOString(),
          }
        : { selected_plan: "proff_basis" };
      const { error } = await supabaseAdmin
        .from("organizations")
        .update(updates)
        .eq("id", organizationId);
      if (error) {
        throw await toClientError("database", error);
      }
    }

    const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
      _organization_id: organizationId,
    });
    if (syncError) {
      throw await toClientError("database", syncError);
    }
    return { organization: await getOrganization(supabaseAdmin, organizationId) };
  });

const ORDER_SELECT =
  "id, term, status, price_ex_vat_nok, billing_email, billing_reference, fiken_invoice_number, period_start, period_end, created_at";

export type ProffOrder = {
  id: string;
  term: ProffTerm;
  status: "pending" | "invoiced" | "paid" | "cancelled";
  price_ex_vat_nok: number;
  billing_email: string;
  billing_reference: string | null;
  fiken_invoice_number: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

async function findOpenProffOrder(
  supabaseAdmin: AdminClient,
  organizationId: string,
): Promise<ProffOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("proff_orders")
    .select(ORDER_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["pending", "invoiced"])
    .maybeSingle();
  if (error) {
    throw await toClientError("database", error);
  }
  return (data as ProffOrder | null) ?? null;
}

export const getOpenProffOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    return { order: await findOpenProffOrder(supabaseAdmin, organizationId) };
  });

export const requestProffSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        term: z.enum(["monthly", "yearly"]),
        billingReference: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const term = PROFF_TERMS[data.term];
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("organization_billing_profiles")
      .select("billing_email, address_line, postal_code, city")
      .eq("organization_id", organizationId)
      .single();
    if (profileError) {
      throw await toClientError("database", profileError);
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("proff_orders")
      .insert({
        organization_id: organizationId,
        requested_by: context.userId,
        term: term.id,
        price_ex_vat_nok: term.priceExVatNok,
        billing_email: profile.billing_email,
        billing_reference: data.billingReference || null,
      })
      .select(ORDER_SELECT)
      .single();
    if (error) {
      if (error.code === "23505") {
        const existing = await findOpenProffOrder(supabaseAdmin, organizationId);
        if (existing) return { order: existing, alreadyOpen: true };
      }
      throw error;
    }
    const organization = await getOrganization(supabaseAdmin, organizationId);
    await notifyProffOrder(supabaseAdmin, organization, inserted as ProffOrder);
    return { order: inserted as ProffOrder, alreadyOpen: false, billingAddress: profile };
  });

/**
 * Who follows up a new order. PROFF_ORDER_INBOX wins when set (a shared sales
 * address), otherwise every admin is notified so the alert never depends on
 * configuration that may be missing.
 */
async function proffOrderRecipients(supabaseAdmin: AdminClient): Promise<string[]> {
  const configured = process.env.PROFF_ORDER_INBOX?.trim();
  if (configured) return [configured];

  const { data: admins, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (error) {
    throw await toClientError("database", error);
  }

  const emails = await Promise.all(
    (admins ?? []).map(async ({ user_id }) => {
      const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id);
      return userError ? null : (data.user?.email ?? null);
    }),
  );
  return emails.filter((email): email is string => Boolean(email));
}

/** Phase 0: the invoice is created by hand in Fiken, so a human has to be told. */
async function notifyProffOrder(
  supabaseAdmin: AdminClient,
  organization: { legal_name: string; organization_number: string; display_name: string },
  order: ProffOrder,
) {
  try {
    const to = await proffOrderRecipients(supabaseAdmin);
    if (to.length === 0) {
      console.error("No Proff order recipients configured, skipping notification");
      return;
    }
    const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
    const { sendInternalEmail } = await import("@/lib/email.server");
    await sendInternalEmail({
      to,
      subject: `Proff-bestilling: ${organization.legal_name}`,
      text: [
        `Bedrift: ${organization.legal_name} (${organization.display_name})`,
        `Org.nr: ${organization.organization_number}`,
        `Periode: ${order.term === "yearly" ? "Årlig" : "Månedlig"}`,
        `Pris: ${order.price_ex_vat_nok} kr eks. mva`,
        `Fakturaepost: ${order.billing_email}`,
        `Deres referanse: ${order.billing_reference ?? "—"}`,
        `Ordre-ID: ${order.id}`,
        "",
        "Opprett faktura i Fiken og registrer den under Admin → Proff-abonnement:",
        `${siteUrl}/admin/proff-abonnement`,
      ].join("\n"),
    });
  } catch (cause) {
    // The order is stored; a failed notification must not fail the customer's request.
    console.error("Failed to send Proff order notification", describeSafeError(cause));
  }
}
