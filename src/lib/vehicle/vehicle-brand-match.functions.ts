import type { VehicleBrandGroup } from "@/lib/category-filters";
import { findModelContainedIn } from "./vehicle-brand-match";

// Re-eksportert for eksisterende importører; selve implementasjonen ligger i
// den rene (klient-trygge) modulen ved siden av.
export { findModelContainedIn };

/** Matches a raw SVV brand/model string against already-approved
 * vehicle_brands/vehicle_models rows for the given category group. Used by
 * `lookupVehicleByRegNumber` — kept as a plain function so the caller
 * doesn't pay for an extra SVV lookup just to re-run this matching. */
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
