// Leseside-URL for organisasjonslogoer under R2-cutoveren.
//
// `uploadOrganizationLogo` (src/lib/storage.functions.ts) skriver nye logoer
// til R2 med nøkkelen `{organizationId}/logo-{crypto.randomUUID()}.{ext}`.
// Gamle logoer som ble lastet opp til Supabase Storage før cutoveren har
// derimot nøkkelen `{organizationId}/logo-{Date.now()}.{ext}` — rene siffer
// etter `logo-` i stedet for en uuid. Siden `organization-logos`-bucketen
// (supabase/migrations/20260901140000_business_accounts.sql) ble opprettet
// med `public = true`, serverer Supabase fortsatt disse gamle filene
// offentlig selv om RLS-policyene på `storage.objects` er droppet
// (20260918210000_drop_dead_storage_object_policies.sql) — så det finnes
// ingen datamigrering å vente på, bare to gyldige URL-skjemaer å skille
// mellom ut fra suffikset i stien.
import { supabase } from "@/integrations/supabase/client";
import { publicImageUrl } from "@/lib/image-url";

const OLD_SUPABASE_LOGO_PATH_RE = /\/logo-\d+\.[^./]+$/;

/** Offentlig URL for en organisasjonslogo, uavhengig av om den ligger i
 * Supabase Storage (gammel opplasting) eller R2 (opplastet etter cutover). */
export function organizationLogoUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  // ponytail: midlertidig gren for logoer som aldri ble kopiert til R2 eller
  // lastet opp på nytt — kan fjernes når alle gamle Supabase-logoer er borte.
  if (OLD_SUPABASE_LOGO_PATH_RE.test(logoPath)) {
    return supabase.storage.from("organization-logos").getPublicUrl(logoPath).data.publicUrl;
  }
  return publicImageUrl(logoPath);
}
