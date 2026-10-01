import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { ClientError, toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isValidOrganizationNumber, normalizeOrganizationNumber } from "@/lib/organization-number";
import { uuid } from "@/lib/business/schemas";

// Server-only modules must stay dynamically imported because this module is also
// imported by browser components through createServerFn.

const DUPLICATE_ORGANIZATION_MESSAGE = "Denne bedriften er allerede registrert på Kaupet.";
const SUPPORT_MESSAGE = "Du kan også kontakte support på kontakt@kaupet.no.";

// L-11: this used to include a masked contact email (an***@ka***.no) in the
// response. Combined with the organization number, that's often enough to
// guess the full address — and the endpoint requires no login. Refer to
// support instead; they can share contact info after an identity check.
function duplicateOrganizationMessage(): string {
  return `${DUPLICATE_ORGANIZATION_MESSAGE} ${SUPPORT_MESSAGE}`;
}

function assertOrganizationNumber(value: string): string {
  const normalized = normalizeOrganizationNumber(value);
  if (!isValidOrganizationNumber(normalized)) {
    throw new ClientError("Skriv inn et gyldig organisasjonsnummer.", 400);
  }
  return normalized;
}

export type BusinessAddress = {
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
};

export type BusinessOrganizationLookup = {
  signupToken: string;
  organizationNumber: string;
  legalName: string;
  visitingAddress: BusinessAddress;
  billingAddress: BusinessAddress;
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
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("lookup-business-organization", 20, 600);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("organization_number", organizationNumber)
      .maybeSingle();
    if (existingError) {
      throw await toClientError("database", existingError);
    }
    if (existing) {
      throw new Error(duplicateOrganizationMessage());
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
        visiting_address_line: organization.visitingAddress.addressLine,
        visiting_postal_code: organization.visitingAddress.postalCode,
        visiting_city: organization.visitingAddress.city,
        billing_address_line: organization.billingAddress.addressLine,
        billing_postal_code: organization.billingAddress.postalCode,
        billing_city: organization.billingAddress.city,
      })
      .select(
        "signup_token, organization_number, legal_name, visiting_address_line, visiting_postal_code, visiting_city, billing_address_line, billing_postal_code, billing_city, expires_at",
      )
      .single();
    if (intentError) {
      if (intentError.code === "23505") {
        throw new Error(`${DUPLICATE_ORGANIZATION_MESSAGE} ${SUPPORT_MESSAGE}`);
      }
      throw await toClientError("createBusinessSignupIntent", intentError);
    }

    return {
      signupToken: intent.signup_token as string,
      organizationNumber: intent.organization_number as string,
      legalName: intent.legal_name as string,
      visitingAddress: {
        addressLine: (intent.visiting_address_line as string | null) ?? null,
        postalCode: (intent.visiting_postal_code as string | null) ?? null,
        city: (intent.visiting_city as string | null) ?? null,
      },
      billingAddress: {
        addressLine: (intent.billing_address_line as string | null) ?? null,
        postalCode: (intent.billing_postal_code as string | null) ?? null,
        city: (intent.billing_city as string | null) ?? null,
      },
      postalCode: (intent.visiting_postal_code as string | null) ?? null,
      city: (intent.visiting_city as string | null) ?? null,
      expiresAt: intent.expires_at as string,
    };
  });

export const bindBusinessSignupEmail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ signupToken: uuid, email: z.string().trim().email() }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const supabaseAdmin = await getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data: intent, error: intentError } = await supabaseAdmin
      .from("business_signup_intents")
      .select("signup_token, email, expires_at")
      .eq("signup_token", data.signupToken)
      .gt("expires_at", now)
      .maybeSingle();
    if (intentError) {
      throw await toClientError("database", intentError);
    }
    if (!intent) throw new ClientError("Registreringen er utløpt. Start på nytt.", 409);
    if (intent.email && intent.email !== email) {
      throw new ClientError(
        "Denne registreringen er allerede knyttet til en annen e-postadresse.",
        409,
      );
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
    if (updateError) {
      throw await toClientError("database", updateError);
    }
    if (updated?.email === email) return { email };

    // A concurrent binder won the conditional update; only the same address may reuse it.
    const { data: rebound, error: reboundError } = await supabaseAdmin
      .from("business_signup_intents")
      .select("email")
      .eq("signup_token", data.signupToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (reboundError) {
      throw await toClientError("database", reboundError);
    }
    if (rebound?.email === email) return { email };
    throw new ClientError(
      "Denne registreringen er allerede knyttet til en annen e-postadresse.",
      409,
    );
  });
