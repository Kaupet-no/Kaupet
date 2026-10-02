import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { ClientError, toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole } from "@/lib/admin-auth.server";
import { passwordSchema } from "@/lib/auth-schemas";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Ugyldig e-postadresse").max(255),
  password: passwordSchema.max(72, "Maks 72 tegn"),
  displayName: z.string().trim().min(1, "Visningsnavn er påkrevd").max(80),
});

export const createDemoUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.supabase, context.userId);

    const supabaseAdmin = await getSupabaseAdmin();

    // Create auth user with confirmed email
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (createErr) {
      const msg = createErr.message ?? "";
      if (/already.*registered|exists/i.test(msg)) {
        throw new ClientError("E-postadressen er allerede i bruk", 409);
      }
      throw new Error(msg || "Kunne ikke opprette bruker");
    }
    const userId = created.user?.id;
    // eslint-disable-next-line no-restricted-syntax -- uventet serverfeil (500)
    if (!userId) throw new Error("Bruker ble ikke opprettet");

    // Ensure profile has the right display name (handle_new_user trigger creates it)
    await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", userId);

    // Grant demo role + log via existing RPC (runs as the admin caller)
    const { error: roleAssignErr } = await context.supabase.rpc("admin_grant_demo_role", {
      _user_id: userId,
    });
    if (roleAssignErr) {
      throw await toClientError("database", roleAssignErr);
    }

    return { user_id: userId, email: data.email };
  });
