import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROFF_TERMS, hasPaidProffPeriod, type ProffTerm } from "@/features/business-account/plans";
import {
  getOrganization,
  hasEffectiveProffAccess,
  requireSuperuserOrganization,
  type AdminClient,
} from "@/lib/business/organization-access";
import { describeSafeError } from "@/lib/safe-error";
import {
  proffCancelledEmail,
  trialEndedEmail,
  trialStartedEmail,
} from "@/lib/business-email-templates";
import { sendBusinessReceipt } from "@/lib/business/business-emails.server";
import { toClientError } from "@/lib/to-client-error";
import type { Database } from "@/integrations/supabase/types";

const planSchema = z.enum(["proff_basis", "proff"]);
const USED_TRIAL_MESSAGE =
  "Prøveperioden er brukt. Bestill Proff for å fortsette med de betalte funksjonene.";
const ORDER_FIRST_MESSAGE = "Bestill Proff for å starte prøveperioden.";
const ENDED_BY_KAUPET_MESSAGE =
  "Proff-avtalen er avsluttet av Kaupet. Kontakt proff@kaupet.no hvis du vil fortsette.";

export const setBusinessPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ plan: planSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const current = await getOrganization(supabaseAdmin, organizationId);
    const now = new Date();

    if (data.plan === "proff") {
      // Prøveperioden starter med første bestilling (requestProffSubscription),
      // så det å velge Proff her er bare gyldig når tilgangen allerede er aktiv.
      const hasAccess = await hasEffectiveProffAccess(supabaseAdmin, organizationId);
      if (current.selected_plan === "proff" && hasAccess) {
        if (!current.proff_subscription_cancelled_at) return { organization: current };
        if (current.proff_ended_by_kaupet_at) throw new Error(ENDED_BY_KAUPET_MESSAGE);
        // Angrer oppsigelsen mens betalt periode løper: abonnementet fortsetter.
        const { error } = await supabaseAdmin
          .from("organizations")
          .update({ proff_subscription_cancelled_at: null })
          .eq("id", organizationId);
        if (error) {
          throw await toClientError("database", error);
        }
        return { organization: await getOrganization(supabaseAdmin, organizationId) };
      }
      throw new Error(current.proff_trial_started_at ? USED_TRIAL_MESSAGE : ORDER_FIRST_MESSAGE);
    } else {
      const hasAccess =
        current.selected_plan === "proff" &&
        (await hasEffectiveProffAccess(supabaseAdmin, organizationId));
      if (hasAccess && hasPaidProffPeriod(current)) {
        return {
          organization: await cancelPaidSubscription(supabaseAdmin, organizationId, context.userId),
        };
      }
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
      if (hasAccess) {
        // Avsluttet: åpen faktura skal ikke betales. Var den allerede sendt,
        // ser admin det på «Prøveperiode avsluttet»-hendelsen og krediterer i Fiken.
        const { data: cancelledOrders, error: orderError } = await supabaseAdmin
          .from("proff_orders")
          .update({ status: "cancelled", admin_note: "Avsluttet av kunden" })
          .eq("organization_id", organizationId)
          .in("status", ["pending", "invoiced"])
          .select("status, fiken_invoice_number");
        if (orderError) {
          throw await toClientError("database", orderError);
        }
        await sendBusinessReceipt(
          supabaseAdmin,
          organizationId,
          () =>
            trialEndedEmail({
              displayName: current.display_name,
              legalName: current.legal_name,
              endedAt: now.toISOString(),
              sentInvoiceNumber: sentInvoiceNumber(cancelledOrders),
            }),
          { userIds: [context.userId], includeBilling: true },
        );
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
  "id, term, status, price_ex_vat_nok, billing_email, billing_reference, fiken_invoice_number, invoice_sent_on, invoice_due_on, period_start, period_end, created_at";

/** Fakturanummeret til en kansellert faktura som allerede var sendt (den krediteres). */
function sentInvoiceNumber(
  orders: { status: string; fiken_invoice_number: string | null }[] | null,
) {
  return (
    orders?.find((order) => order.status === "cancelled" && order.fiken_invoice_number)
      ?.fiken_invoice_number ?? null
  );
}

export type ProffOrder = {
  id: string;
  term: ProffTerm;
  status: "pending" | "invoiced" | "paid" | "cancelled";
  price_ex_vat_nok: number;
  billing_email: string;
  billing_reference: string | null;
  fiken_invoice_number: string | null;
  invoice_sent_on: string | null;
  invoice_due_on: string | null;
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
    const current = await getOrganization(supabaseAdmin, organizationId);
    const startsTrial = !current.proff_trial_started_at;
    const { data: inserted, error } = await insertSubscriptionOrder(supabaseAdmin, {
      _organization_id: organizationId,
      _requested_by: context.userId,
      _term: term.id,
      _price_ex_vat_nok: term.priceExVatNok,
      _billing_email: profile.billing_email,
      _billing_reference: data.billingReference || undefined,
    });
    if (error) {
      if (error.message?.includes("agreement_ended_by_kaupet")) {
        throw new Error(ENDED_BY_KAUPET_MESSAGE);
      }
      if (error.message?.includes("trial_used")) throw new Error(USED_TRIAL_MESSAGE);
      if (error.code === "23505") {
        const existing = await findOpenProffOrder(supabaseAdmin, organizationId);
        if (existing) return { order: existing, alreadyOpen: true };
      }
      throw error;
    }
    const organization = await getOrganization(supabaseAdmin, organizationId);
    await notifyProffOrder(
      supabaseAdmin,
      organization,
      inserted as ProffOrder,
      startsTrial ? organization.proff_trial_ends_at : null,
    );
    const trialEndsAt = organization.proff_trial_ends_at;
    if (startsTrial && trialEndsAt) {
      await sendBusinessReceipt(
        supabaseAdmin,
        organizationId,
        () =>
          trialStartedEmail({
            displayName: organization.display_name,
            legalName: organization.legal_name,
            term: term.id,
            trialEndsAt,
            billingEmail: profile.billing_email,
          }),
        { userIds: [context.userId], includeBilling: false },
      );
    }
    return {
      order: inserted as ProffOrder,
      alreadyOpen: false,
      billingAddress: profile,
      trialEndsAt: startsTrial ? organization.proff_trial_ends_at : null,
    };
  });

/**
 * Oppsigelse av betalt Proff: tilgangen løper ut betalt periode, og en åpen
 * faktura for neste periode kanselleres (admin krediterer den i Fiken om den
 * er sendt — se «sa opp Proff»-hendelsen).
 */
async function cancelPaidSubscription(
  supabaseAdmin: AdminClient,
  organizationId: string,
  userId: string,
) {
  const cancelledAt = new Date().toISOString();
  const { data: claimed, error } = await supabaseAdmin
    .from("organizations")
    .update({ proff_subscription_cancelled_at: cancelledAt })
    .eq("id", organizationId)
    .is("proff_subscription_cancelled_at", null)
    .select("id");
  if (error) {
    throw await toClientError("database", error);
  }
  const { data: cancelledOrders, error: orderError } = await supabaseAdmin
    .from("proff_orders")
    .update({ status: "cancelled", admin_note: "Sagt opp av kunden" })
    .eq("organization_id", organizationId)
    .in("status", ["pending", "invoiced"])
    .select("status, fiken_invoice_number");
  if (orderError) {
    throw await toClientError("database", orderError);
  }
  const organization = await getOrganization(supabaseAdmin, organizationId);
  // Bare én bekreftelse, også ved dobbeltklikk: claimed er tom når den allerede var sagt opp.
  const accessUntil = organization.proff_access_until;
  if (claimed?.length && accessUntil) {
    await sendBusinessReceipt(
      supabaseAdmin,
      organizationId,
      () =>
        proffCancelledEmail({
          displayName: organization.display_name,
          legalName: organization.legal_name,
          cancelledAt,
          accessUntil,
          sentInvoiceNumber: sentInvoiceNumber(cancelledOrders),
        }),
      { userIds: [userId], includeBilling: true },
    );
  }
  return organization;
}

/** Bestilling og eventuell prøvestart/gjenopptakelse lagres atomisk. */
async function insertSubscriptionOrder(
  supabaseAdmin: AdminClient,
  args: Database["public"]["Functions"]["request_proff_subscription_order"]["Args"],
) {
  const { data: orderId, error } = await supabaseAdmin.rpc(
    "request_proff_subscription_order",
    args,
  );
  if (error) return { data: null, error };
  return supabaseAdmin.from("proff_orders").select(ORDER_SELECT).eq("id", orderId).single();
}

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

function osloDate(iso: string, offsetDays = 0) {
  const date = new Date(new Date(iso).getTime() + offsetDays * 864e5);
  return date.toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo" });
}

/** Phase 0: the invoice is created by hand in Fiken, so a human has to be told. */
async function notifyProffOrder(
  supabaseAdmin: AdminClient,
  organization: { legal_name: string; organization_number: string; display_name: string },
  order: ProffOrder,
  trialEndsAt: string | null,
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
      subject: `${trialEndsAt ? "Proff-prøveperiode startet" : "Proff-bestilling"}: ${organization.legal_name}`,
      text: [
        `Bedrift: ${organization.legal_name} (${organization.display_name})`,
        `Org.nr: ${organization.organization_number}`,
        `Periode: ${order.term === "yearly" ? "Årlig" : "Månedlig"}`,
        `Pris: ${order.price_ex_vat_nok} kr eks. mva`,
        `Fakturaepost: ${order.billing_email}`,
        `Deres referanse: ${order.billing_reference ?? "—"}`,
        `Ordre-ID: ${order.id}`,
        "",
        trialEndsAt
          ? `Prøveperioden løper til ${osloDate(trialEndsAt)}. Send første faktura med forfall da, senest ${osloDate(trialEndsAt, -14)}. Registrer den under Admin → Proff-abonnement:`
          : "Opprett faktura i Fiken og registrer den under Admin → Proff-abonnement:",
        `${siteUrl}/admin/proff-abonnement`,
      ].join("\n"),
    });
  } catch (cause) {
    // The order is stored; a failed notification must not fail the customer's request.
    console.error("Failed to send Proff order notification", describeSafeError(cause));
  }
}
