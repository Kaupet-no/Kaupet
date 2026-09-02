import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole } from "@/lib/admin-auth.server";

export type AdminUnverifiedOrganization = {
  id: string;
  legal_name: string;
  display_name: string;
  organization_number: string;
  created_at: string;
};

/** Newly registered organizations start unverified — see
 * docs/SIKKERHETSVURDERING.md M-4. Nothing ties the registrant to the actual
 * company, so a manual check here is the gate before they can create or
 * publish any listing under the company name. */
export const adminListUnverifiedOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdminRole(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id, legal_name, display_name, organization_number, created_at")
      .eq("verification_status", "unverified")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as AdminUnverifiedOrganization[];
  });

export const adminVerifyOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.supabase, context.userId);
    // admin_verify_organization checks has_role(auth.uid(), 'admin') itself,
    // so it must run under the caller's own session (not supabaseAdmin,
    // which has no auth.uid()).
    const { error } = await context.supabase.rpc("admin_verify_organization", {
      _organization_id: data.organizationId,
    });
    if (error) throw error;
  });
