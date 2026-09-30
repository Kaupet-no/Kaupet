import { toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pathFromPublicImageUrl } from "@/lib/image-url";

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
      throw await toClientError("database", error);
    }
    return profile;
  });

export const updateOwnAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ avatarUrl: z.string().url().max(2048) }).parse(input))
  .handler(async ({ data, context }) => {
    const parsed = new URL(data.avatarUrl);
    const r2Path = pathFromPublicImageUrl(data.avatarUrl);
    const validR2Avatar =
      r2Path !== null &&
      new RegExp(`^${context.userId}/avatar-[0-9a-f-]{36}\\.(jpg|png|webp|jxl)$`, "i").test(r2Path);
    let configuredOrigin: string | null = null;
    try {
      configuredOrigin = new URL(process.env.SUPABASE_URL ?? "").origin;
    } catch {
      // Reject the URL when the server is missing a valid Supabase origin.
    }
    const expectedPath = `/storage/v1/object/public/avatars/${context.userId}/`;
    const validLegacyAvatar =
      configuredOrigin !== null &&
      parsed.origin === configuredOrigin &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname.startsWith(expectedPath);
    if (!validR2Avatar && !validLegacyAvatar) {
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
      throw await toClientError("database", error);
    }
    return profile;
  });
