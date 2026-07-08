import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_LOOKUPS_PER_HOUR = 20;

export const lookupVehicleByRegNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        registrationNumber: z.string().trim().min(2).max(10),
        // Optional: at the "Bil og MC"-first lookup, the leaf category (and
        // therefore the brand group) isn't known yet — brand/model matching
        // is deferred to matchVehicleBrandModel once the user confirms the
        // auto-detected vehicle type.
        categoryGroup: z
          .enum(["bil", "motorsykkel", "moped_atv", "bobil_campingvogn", "henger"])
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lookupVehicle } = await import("@/lib/vehicle-lookup.server");
    const { matchVehicleBrandAndModel } = await import("@/lib/vehicle-brand-match.functions");
    const { userId } = context;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("vehicle_lookup_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= MAX_LOOKUPS_PER_HOUR) {
      throw new Error("For mange kjøretøyoppslag den siste timen. Prøv igjen senere.");
    }

    const result = await lookupVehicle(data.registrationNumber);
    await supabaseAdmin
      .from("vehicle_lookup_log")
      .insert({ user_id: userId, registration_number: result.registrationNumber });

    let brandMatch: { id: string; name: string } | null = null;
    let modelMatch: { id: string; name: string } | null = null;

    if (data.categoryGroup) {
      const matched = await matchVehicleBrandAndModel(
        supabaseAdmin,
        result.brand,
        result.model,
        data.categoryGroup,
      );
      brandMatch = matched.brandMatch;
      modelMatch = matched.modelMatch;
    }

    return { lookup: result, brandMatch, modelMatch };
  });
