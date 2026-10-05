import type { BusinessEmail } from "@/lib/business-email-templates";
import { describeSafeError } from "@/lib/safe-error";
import type { AdminClient } from "@/lib/business/organization-access";

/**
 * Mottakere for en kvittering: de gitte superbrukerne (eller alle aktive
 * superbrukere), pluss fakturaadressen når `includeBilling` er satt og den er
 * en annen adresse.
 */
async function recipients(
  supabaseAdmin: AdminClient,
  organizationId: string,
  options: { userIds?: string[]; includeBilling: boolean },
): Promise<string[]> {
  let userIds = options.userIds;
  if (!userIds) {
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("role", "superuser")
      .eq("status", "active");
    if (error) throw error;
    userIds = (data ?? []).map((row) => row.user_id);
  }
  const emails = await Promise.all(
    userIds.map(async (id) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
      return error ? null : (data.user?.email ?? null);
    }),
  );
  const result = emails.filter((email): email is string => Boolean(email));
  if (options.includeBilling) {
    const { data } = await supabaseAdmin
      .from("organization_billing_profiles")
      .select("billing_email")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (data?.billing_email) result.push(data.billing_email);
  }
  const seen = new Set<string>();
  return result.filter((email) => {
    const key = email.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Sender en kvittering uten å kunne feile handlingen som utløste den: selve
 * endringen er allerede lagret, og en manglende e-post skal ikke angre den.
 * E-posten bygges også her inne, så en malfeil fanges på samme måte.
 */
export async function sendBusinessReceipt(
  supabaseAdmin: AdminClient,
  organizationId: string,
  buildEmail: () => BusinessEmail,
  options: { userIds?: string[]; includeBilling: boolean },
): Promise<void> {
  try {
    const email = buildEmail();
    const to = await recipients(supabaseAdmin, organizationId, options);
    if (to.length === 0) return;
    const { sendBusinessEmail } = await import("@/lib/email.server");
    await sendBusinessEmail({ to, ...email });
  } catch (cause) {
    console.error("Failed to send business receipt", describeSafeError(cause));
  }
}
