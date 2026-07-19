import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyVehicleCategory } from "@/lib/vehicle-classification";

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
    const { lookupVehicle, formatRetryClockNorway } = await import("@/lib/vehicle-lookup.server");
    const { matchVehicleBrandAndModel } = await import("@/lib/vehicle-brand-match.functions");
    const { userId } = context;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentLookups, count } = await supabaseAdmin
      .from("vehicle_lookup_log")
      .select("created_at", { count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: true });
    if ((count ?? 0) >= MAX_LOOKUPS_PER_HOUR) {
      const oldest = recentLookups?.[0]?.created_at;
      const retryAt = oldest
        ? new Date(new Date(oldest).getTime() + 60 * 60 * 1000)
        : new Date(Date.now() + 60 * 60 * 1000);
      throw new Error(
        `For mange kjøretøyoppslag den siste timen. Prøv igjen ${formatRetryClockNorway(retryAt)}, eller fyll inn kjøretøyopplysningene manuelt i mellomtiden.`,
      );
    }

    const result = await lookupVehicle(data.registrationNumber);
    const classification = classifyVehicleCategory(
      result.classification_code,
      result.avgiftsklasse_code,
      result.body_type_hint,
      result.sleeping_places,
    );

    // Personlige kjennemerker kan overføres mellom kjøretøy av ulik klasse —
    // varsle (mykt, ikke blokkerende) hvis samme bruker har slått opp samme
    // skilt før med en annen utledet kjøretøytype.
    let previousClassificationMismatch: { slug: string | null; lookedUpAt: string } | null = null;
    if (classification.slug) {
      const { data: previous } = await supabaseAdmin
        .from("vehicle_lookup_log")
        .select("classification_result, created_at")
        .eq("user_id", userId)
        .eq("registration_number", result.registrationNumber)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousSlug = (previous?.classification_result as { slug?: string | null } | null)
        ?.slug;
      if (previousSlug && previousSlug !== classification.slug) {
        previousClassificationMismatch = { slug: previousSlug, lookedUpAt: previous!.created_at };
      }
    }

    await supabaseAdmin.from("vehicle_lookup_log").insert({
      user_id: userId,
      registration_number: result.registrationNumber,
      classification_result: classification,
    });

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

    return { lookup: result, brandMatch, modelMatch, previousClassificationMismatch };
  });
