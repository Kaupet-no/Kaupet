import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidOrganizationNumber, normalizeOrganizationNumber } from "@/lib/organization-number";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminClient = SupabaseClient<Database>;

// Server-only modules must stay dynamically imported because this module is also
// imported by browser components through createServerFn.

const DUPLICATE_ORGANIZATION_MESSAGE = "Denne bedriften er allerede registrert på Kaupet.";
const SUPPORT_MESSAGE = "Du kan også kontakte support på kontakt@kaupet.no.";
const UNAUTHORIZED_MESSAGE = "Du har ikke tilgang til bedriftskontoen.";
const PROFF_REQUIRED_MESSAGE = "Denne funksjonen krever et aktivt Proff-abonnement.";
const USED_TRIAL_MESSAGE =
  "Prøveperioden er brukt. Proff kan aktiveres når betalingsløsningen er på plass.";
const INVITE_EXISTING_MESSAGE =
  "E-postadressen er allerede i bruk. Invitasjon av eksisterende kontoer støttes ikke ennå.";

function maskContactEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0) return null;

  const localPart = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  const tldSeparator = domain.lastIndexOf(".");
  if (!domain || tldSeparator <= 0 || tldSeparator === domain.length - 1) return null;

  const host = domain.slice(0, tldSeparator);
  const tld = domain.slice(tldSeparator);
  return `${localPart.slice(0, 2)}***@${host.slice(0, 2)}***${tld}`;
}

async function duplicateOrganizationMessage(
  supabaseAdmin: AdminClient,
  organizationId: string,
): Promise<string> {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "superuser")
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) return `${DUPLICATE_ORGANIZATION_MESSAGE} ${SUPPORT_MESSAGE}`;

  const userId = membership?.user_id as string | undefined;
  if (!userId) return `${DUPLICATE_ORGANIZATION_MESSAGE} ${SUPPORT_MESSAGE}`;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const maskedEmail = !error && data.user?.email ? maskContactEmail(data.user.email) : null;
  return [
    DUPLICATE_ORGANIZATION_MESSAGE,
    maskedEmail ? `Bedriftens kontaktperson er ${maskedEmail}.` : null,
    SUPPORT_MESSAGE,
  ]
    .filter(Boolean)
    .join(" ");
}

const uuid = z.string().uuid();
const planSchema = z.enum(["proff_basis", "proff"]);

function assertOrganizationNumber(value: string): string {
  const normalized = normalizeOrganizationNumber(value);
  if (!isValidOrganizationNumber(normalized)) {
    throw new Error("Skriv inn et gyldig organisasjonsnummer.");
  }
  return normalized;
}

async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireSuperuserOrganization(userId: string) {
  const supabaseAdmin = await getAdmin();
  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("role", "superuser")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!membership) throw new Error(UNAUTHORIZED_MESSAGE);

  const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
    _organization_id: membership.organization_id,
  });
  if (syncError) throw syncError;
  return { supabaseAdmin, organizationId: membership.organization_id as string };
}

async function hasEffectiveProffAccess(supabaseAdmin: AdminClient, organizationId: string) {
  const { data, error } = await supabaseAdmin.rpc("organization_has_proff_access", {
    _organization_id: organizationId,
  });
  if (error) throw error;
  return data === true;
}

export type BusinessOrganizationLookup = {
  signupToken: string;
  organizationNumber: string;
  legalName: string;
  postalCode: string | null;
  city: string | null;
  expiresAt: string;
};

export const lookupBusinessOrganization = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        organizationNumber: z.string().trim().min(1),
        turnstileToken: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BusinessOrganizationLookup> => {
    const organizationNumber = assertOrganizationNumber(data.organizationNumber);
    const { verifyTurnstileToken } = await import("@/lib/turnstile.server");
    await verifyTurnstileToken(data.turnstileToken);
    const supabaseAdmin = await getAdmin();

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("organization_number", organizationNumber)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      throw new Error(await duplicateOrganizationMessage(supabaseAdmin, existing.id as string));
    }
    await supabaseAdmin
      .from("business_signup_intents")
      .delete()
      .lt("expires_at", new Date().toISOString());

    const { fetchOrganizationFromBrreg } = await import("@/lib/brreg.server");
    const organization = await fetchOrganizationFromBrreg(organizationNumber);

    const { data: intent, error: intentError } = await supabaseAdmin
      .from("business_signup_intents")
      .insert({
        organization_number: organization.organizationNumber,
        legal_name: organization.legalName,
        postal_code: organization.postalCode,
        city: organization.city,
      })
      .select("signup_token, organization_number, legal_name, postal_code, city, expires_at")
      .single();
    if (intentError) {
      if (intentError.code === "23505") {
        throw new Error(`${DUPLICATE_ORGANIZATION_MESSAGE} ${SUPPORT_MESSAGE}`);
      }
      throw intentError;
    }

    return {
      signupToken: intent.signup_token as string,
      organizationNumber: intent.organization_number as string,
      legalName: intent.legal_name as string,
      postalCode: (intent.postal_code as string | null) ?? null,
      city: (intent.city as string | null) ?? null,
      expiresAt: intent.expires_at as string,
    };
  });

export const bindBusinessSignupEmail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ signupToken: uuid, email: z.string().trim().email() }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const supabaseAdmin = await getAdmin();
    const now = new Date().toISOString();
    const { data: intent, error: intentError } = await supabaseAdmin
      .from("business_signup_intents")
      .select("signup_token, email, expires_at")
      .eq("signup_token", data.signupToken)
      .gt("expires_at", now)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent) throw new Error("Registreringen er utløpt. Start på nytt.");
    if (intent.email && intent.email !== email) {
      throw new Error("Denne registreringen er allerede knyttet til en annen e-postadresse.");
    }
    if (intent.email === email) return { email };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("business_signup_intents")
      .update({ email })
      .eq("signup_token", data.signupToken)
      .is("email", null)
      .gt("expires_at", now)
      .select("email")
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated?.email === email) return { email };

    // A concurrent binder won the conditional update; only the same address may reuse it.
    const { data: rebound, error: reboundError } = await supabaseAdmin
      .from("business_signup_intents")
      .select("email")
      .eq("signup_token", data.signupToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (reboundError) throw reboundError;
    if (rebound?.email === email) return { email };
    throw new Error("Denne registreringen er allerede knyttet til en annen e-postadresse.");
  });

async function getOrganization(supabaseAdmin: AdminClient, organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, organization_number, legal_name, display_name, postal_code, city, selected_plan, proff_trial_started_at, proff_trial_ends_at, proff_trial_cancelled_at, proff_access_until, website_url, logo_path, brand_palette",
    )
    .eq("id", organizationId)
    .single();
  if (error) throw error;
  return data;
}

export const getBusinessOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const organization = await getOrganization(supabaseAdmin, organizationId);
    return {
      organization,
      membership: { organizationId, role: "superuser" as const, status: "active" as const },
    };
  });

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
      if (error) throw error;
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
      if (error) throw error;
    }

    const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
      _organization_id: organizationId,
    });
    if (syncError) throw syncError;
    return { organization: await getOrganization(supabaseAdmin, organizationId) };
  });

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  postalCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  city: z.string().trim().min(1).max(100).optional(),
  websiteUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), "Nettsiden må bruke https://")
    .nullable()
    .optional(),
  logoPath: z.string().trim().max(500).nullable().optional(),
  brandPalette: z.enum(["forest", "navy", "burgundy", "slate"]).nullable().optional(),
});

export const updateBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    const advancedRequested =
      data.websiteUrl !== undefined ||
      data.logoPath !== undefined ||
      data.brandPalette !== undefined;
    if (advancedRequested && !(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new Error(PROFF_REQUIRED_MESSAGE);
    }

    const updates = {
      ...(data.displayName !== undefined && { display_name: data.displayName }),
      ...(data.postalCode !== undefined && { postal_code: data.postalCode }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.websiteUrl !== undefined && { website_url: data.websiteUrl }),
      ...(data.logoPath !== undefined && { logo_path: data.logoPath }),
      ...(data.brandPalette !== undefined && { brand_palette: data.brandPalette }),
    };
    const { data: organization, error } = await supabaseAdmin
      .from("organizations")
      .update(updates)
      .eq("id", organizationId)
      .select(
        "id, organization_number, legal_name, display_name, postal_code, city, selected_plan, proff_trial_started_at, proff_trial_ends_at, proff_trial_cancelled_at, proff_access_until, website_url, logo_path, brand_palette",
      )
      .single();
    if (error) throw error;
    return { organization };
  });

async function businessInvitationRedirect(): Promise<string> {
  const configuredOrigin = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configuredOrigin) return `${configuredOrigin}/bedriftsinvitasjon`;

  try {
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const host = getRequestHost();
    const allowedHost =
      host === "kaupet.no" ||
      host === "www.kaupet.no" ||
      host === "test.kaupet.no" ||
      host.startsWith("localhost:") ||
      host.startsWith("127.0.0.1:");
    if (allowedHost) {
      const protocol =
        host.startsWith("localhost:") || host.startsWith("127.0.0.1:") ? "http" : "https";
      return `${protocol}://${host}/bedriftsinvitasjon`;
    }
  } catch {
    // Server functions can also run without a request context in jobs/tests.
  }
  return "https://kaupet.no/bedriftsinvitasjon";
}

export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, organizationId } = await requireSuperuserOrganization(context.userId);
    if (!(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new Error(PROFF_REQUIRED_MESSAGE);
    }
    const email = data.email.trim().toLowerCase();
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { display_name: data.name.trim() },
        redirectTo: await businessInvitationRedirect(),
      },
    );
    if (inviteError) {
      if (
        inviteError.status === 422 ||
        /already|registered|exists|in use/i.test(inviteError.message)
      ) {
        throw new Error(INVITE_EXISTING_MESSAGE);
      }
      throw inviteError;
    }
    const userId = invited.user?.id;
    if (!userId) throw new Error("Kunne ikke opprette invitasjonen. Prøv igjen.");

    const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      role: "member",
      status: "invited",
    });
    if (memberError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      if (memberError.code === "23505") throw new Error(INVITE_EXISTING_MESSAGE);
      throw memberError;
    }
    return { userId, email };
  });

export const acceptOrganizationInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getAdmin();
    const { data: membership, error: lookupError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("user_id", context.userId)
      .eq("role", "member")
      .eq("status", "invited")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!membership) throw new Error("Invitasjonen er ugyldig, utløpt eller allerede brukt.");
    const organizationId = membership.organization_id as string;
    const { error: syncError } = await supabaseAdmin.rpc("sync_organization_entitlements", {
      _organization_id: organizationId,
    });
    if (syncError) throw syncError;
    if (!(await hasEffectiveProffAccess(supabaseAdmin, organizationId))) {
      throw new Error("Invitasjonen er ikke lenger tilgjengelig.");
    }

    const { data: accepted, error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: "active" })
      .eq("organization_id", membership.organization_id)
      .eq("user_id", context.userId)
      .eq("status", "invited")
      .select("organization_id")
      .single();
    if (error) throw error;
    return { organizationId: accepted.organization_id as string };
  });

export const removeOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { organizationId } = await requireSuperuserOrganization(context.userId);
    const { error } = await context.supabase.rpc("remove_organization_member", {
      _organization_id: organizationId,
      _user_id: data.userId,
    });
    if (error) throw error;
    return { userId: data.userId };
  });
