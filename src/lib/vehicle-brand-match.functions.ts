import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VehicleBrandGroup } from "@/lib/category-filters";

/** SVV's model text often carries a trim/variant suffix beyond the plain
 * model name (e.g. "Leaf 30kWh", "Golf GTE 1.4"). An exact match against
 * `vehicle_models` would miss these even though the base model ("Leaf") is
 * registered — so once an exact match fails, fall back to finding an
 * approved model name that appears as a whole word within the SVV text,
 * preferring the longest (most specific) match. Returns the *registered*
 * row so its canonical name (not the raw SVV variant text) is what gets
 * used downstream, matching the user's expectation that a known model like
 * "Leaf" is what should be selected rather than proposed as a new value. */
function findModelContainedIn(
  models: { id: string; name: string }[],
  modelText: string,
): { id: string; name: string } | null {
  const lower = modelText.toLowerCase();
  const isWordChar = (ch: string) => /[a-z0-9æøå]/i.test(ch);
  const candidates = models
    .filter((m) => m.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  for (const m of candidates) {
    const nameLower = m.name.toLowerCase();
    const idx = lower.indexOf(nameLower);
    if (idx === -1) continue;
    const before = idx === 0 ? "" : lower[idx - 1];
    const after = idx + nameLower.length >= lower.length ? "" : lower[idx + nameLower.length];
    if (!isWordChar(before) && !isWordChar(after)) return m;
  }
  return null;
}

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
  modelMatch: { id: string; name: string } | null;
}> {
  let brandMatch: { id: string; name: string } | null = null;
  let modelMatch: { id: string; name: string } | null = null;

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
          .select("id, name")
          .eq("brand_id", brandRow.id)
          .eq("status", "approved")
          .ilike("name", model)
          .maybeSingle();
        if (modelRow) {
          modelMatch = modelRow;
        } else {
          const { data: brandModels } = await supabaseAdmin
            .from("vehicle_models")
            .select("id, name")
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
  .inputValidator((input: unknown) =>
    z
      .object({
        brand: z.string().nullable(),
        model: z.string().nullable(),
        categoryGroup: z.enum(["bil", "motorsykkel", "moped_atv", "bobil_campingvogn", "henger"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return matchVehicleBrandAndModel(supabaseAdmin, data.brand, data.model, data.categoryGroup);
  });
