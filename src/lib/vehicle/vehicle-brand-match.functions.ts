import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VehicleBrandGroup } from "@/lib/category-filters";
import { findModelContainedIn } from "./vehicle-brand-match";

// Re-eksportert for eksisterende importører; selve implementasjonen ligger i
// den rene (klient-trygge) modulen ved siden av.
export { findModelContainedIn };

/** Matches a raw SVV brand/model string against already-approved
 * vehicle_brands/vehicle_models rows for the given category group. Shared by
 * `lookupVehicleByRegNumber` (categoryGroup known up front, e.g. manual leaf
 * already picked) and `matchVehicleBrandAndModel` server fn (categoryGroup
 * only known after vehicle-confirm, in the vehicle-first flow) — kept as a
 * plain function so neither caller pays for an extra SVV lookup just to
 * re-run this matching. */
export async function matchVehicleBrandAndModel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  brand: string | null,
  model: string | null,
  categoryGroup: VehicleBrandGroup,
): Promise<{
  brandMatch: { id: string; name: string } | null;
  modelMatch: { id: string; name: string; class_id: string | null } | null;
}> {
  let brandMatch: { id: string; name: string } | null = null;
  let modelMatch: { id: string; name: string; class_id: string | null } | null = null;

  if (brand) {
    const { data: brandRow } = await supabaseAdmin
      .from("vehicle_brands")
      .select("id, name")
      .eq("category_group", categoryGroup)
      .eq("status", "approved")
      .ilike("name", brand)
      .maybeSingle();
    if (brandRow) {
      brandMatch = brandRow;
      if (model) {
        const { data: modelRow } = await supabaseAdmin
          .from("vehicle_models")
          .select("id, name, class_id")
          .eq("brand_id", brandRow.id)
          .eq("status", "approved")
          .ilike("name", model)
          .maybeSingle();
        if (modelRow) {
          modelMatch = modelRow;
        } else {
          const { data: brandModels } = await supabaseAdmin
            .from("vehicle_models")
            .select("id, name, class_id")
            .eq("brand_id", brandRow.id)
            .eq("status", "approved");
          modelMatch = findModelContainedIn(brandModels ?? [], model);
        }
      }
    }
  }

  return { brandMatch, modelMatch };
}

/** Deferred brand/model match, called once the vehicle-first flow knows the
 * category group (after the user confirms the auto-detected vehicle type in
 * vehicle-confirm). Doesn't hit Statens Vegvesen again, so it isn't subject
 * to the SVV lookup rate limit. */
export const matchVehicleBrandModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        brand: z.string().nullable(),
        model: z.string().nullable(),
        categoryGroup: z.enum([
          "bil",
          "motorsykkel",
          "moped_atv",
          "bobil_campingvogn",
          "henger",
          "lastebil",
          "buss",
          "traktor",
          "anleggsmaskin",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return matchVehicleBrandAndModel(supabaseAdmin, data.brand, data.model, data.categoryGroup);
  });
