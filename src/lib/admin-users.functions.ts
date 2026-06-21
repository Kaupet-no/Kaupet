import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole } from "@/lib/admin-auth.server";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Ugyldig e-postadresse").max(255),
  password: z.string().min(8, "Minst 8 tegn").max(72, "Maks 72 tegn"),
  displayName: z.string().trim().min(1, "Visningsnavn er påkrevd").max(80),
});

export const createDemoUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
        throw new Error("E-postadressen er allerede i bruk");
      }
      throw new Error(msg || "Kunne ikke opprette bruker");
    }
    const userId = created.user?.id;
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
    if (roleAssignErr) throw roleAssignErr;

    return { user_id: userId, email: data.email };
  });
