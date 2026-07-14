import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VehicleBrandGroup } from "@/lib/category-filters";

const MAX_LOOKUPS_PER_HOUR = 20;

export const lookupVehicleByRegNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        registrationNumber: z.string().trim().min(2).max(10),
        categoryGroup: z.enum(["bil", "motorsykkel", "moped_atv", "bobil_campingvogn", "henger"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lookupVehicle } = await import("@/lib/vehicle-lookup.server");
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

    const categoryGroup: VehicleBrandGroup = data.categoryGroup;
    let brandMatch: { id: string; name: string } | null = null;
    let modelMatch: { id: string; name: string } | null = null;

    if (result.brand) {
      // Only match already-approved brands/models — a pending, unapproved
      // proposal from another user shouldn't be silently auto-selected here.
      const { data: brandRow } = await supabaseAdmin
        .from("vehicle_brands")
        .select("id, name")
        .eq("category_group", categoryGroup)
        .eq("status", "approved")
        .ilike("name", result.brand)
        .maybeSingle();
      if (brandRow) {
        brandMatch = brandRow;
        if (result.model) {
          const { data: modelRow } = await supabaseAdmin
            .from("vehicle_models")
            .select("id, name")
            .eq("brand_id", brandRow.id)
            .eq("status", "approved")
            .ilike("name", result.model)
            .maybeSingle();
          if (modelRow) modelMatch = modelRow;
        }
      }
    }

    return { lookup: result, brandMatch, modelMatch };
  });
