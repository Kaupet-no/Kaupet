import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Minst 2 tegn").max(80),
});

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", context.userId)
      .select("id, display_name, avatar_url")
      .single();
    if (error) {
      const { toClientError } = await import("@/lib/to-client-error");
      throw await toClientError("database", error);
    }
    return profile;
  });

export const updateOwnAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ avatarUrl: z.string().url().max(2048) }).parse(input))
  .handler(async ({ data, context }) => {
    const parsed = new URL(data.avatarUrl);
    let configuredOrigin: string | null = null;
    try {
      configuredOrigin = new URL(process.env.SUPABASE_URL ?? "").origin;
    } catch {
      // Reject the URL when the server is missing a valid Supabase origin.
    }
    const expectedPath = `/storage/v1/object/public/avatars/${context.userId}/`;
    if (
      !configuredOrigin ||
      parsed.origin !== configuredOrigin ||
      !parsed.pathname.startsWith(expectedPath)
    ) {
      throw new Error("Ugyldig profilbilde");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: data.avatarUrl })
      .eq("id", context.userId)
      .select("id, display_name, avatar_url")
      .single();
    if (error) {
      const { toClientError } = await import("@/lib/to-client-error");
      throw await toClientError("database", error);
    }
    return profile;
  });
