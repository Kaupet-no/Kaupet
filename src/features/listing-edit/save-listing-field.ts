import { supabase } from "@/integrations/supabase/client";
import type { CategoryBehavior } from "@/lib/category-behavior";
import type { Database, Json } from "@/integrations/supabase/types";

export type ListingFieldPatch =
  | { group: "title"; title: string }
  | { group: "subtitle"; subtitle: string | null }
  | { group: "description"; description: string }
  | { group: "condition"; condition: string | null }
  | { group: "price"; is_free: boolean; price_nok: number | null }
  | { group: "delivery"; can_ship: boolean | null }
  | {
      group: "location";
      postal_code: string | null;
      city: string | null;
      lat: number | null;
      lng: number | null;
    }
  | {
      group: "vehicle-condition";
      known_issues: string | null;
      no_known_issues: boolean;
      maintenance_history: string | null;
    }
  | { group: "attributes"; attributes: Record<string, unknown> }
  | { group: "category"; category_id: string; attributes: Record<string, unknown> };

/**
 * Per-field autosave for inline listing editing — generalizes the single big
 * `mutationFn` from the old `mine-annonser.$id.rediger.tsx` (whole-form
 * update) into one small update per `ListingFieldPatch`. Reuses
 * `getCategoryBehavior` so the same nullification rules apply (condition/
 * can_ship forced to `null` when the category doesn't require them).
 */
export async function saveListingField(
  listingId: string,
  patch: ListingFieldPatch,
  ctx: { behavior: CategoryBehavior },
): Promise<void> {
  let updateData: Database["public"]["Tables"]["listings"]["Update"];

  switch (patch.group) {
    case "title":
      updateData = { title: patch.title };
      break;
    case "subtitle":
      updateData = { subtitle: patch.subtitle || null };
      break;
    case "description":
      updateData = { description: patch.description };
      break;
    case "condition":
      updateData = {
        condition: (patch.condition ?? null) as
          "new" | "like_new" | "good" | "acceptable" | "for_parts" | null,
      };
      break;
    case "price": {
      if (!patch.is_free && patch.price_nok == null) {
        throw new Error("Oppgi en pris før annonsen lagres");
      }
      updateData = {
        is_free: patch.is_free,
        price_nok: patch.is_free ? null : patch.price_nok,
      };
      break;
    }
    case "delivery": {
      if (!ctx.behavior.requiresDeliveryMethod) return;
      updateData = { can_ship: patch.can_ship };
      break;
    }
    case "location":
      updateData = {
        postal_code: patch.postal_code || null,
        city: patch.city || null,
        lat: patch.lat,
        lng: patch.lng,
      };
      break;
    case "vehicle-condition":
      updateData = {
        known_issues: patch.known_issues || null,
        no_known_issues: !!patch.no_known_issues,
        maintenance_history: patch.maintenance_history || null,
      };
      break;
    case "attributes": {
      // Shallow-merge on the client against the current attributes before
      // writing, since several inline sections (vehicle facts, equipment,
      // generic category attributes) all write to the same JSON column.
      const { data: current, error: readErr } = await supabase
        .from("listings")
        .select("attributes")
        .eq("id", listingId)
        .single();
      if (readErr) throw readErr;
      const merged = {
        ...((current?.attributes as Record<string, unknown>) ?? {}),
        ...patch.attributes,
      };
      updateData = { attributes: merged as unknown as Json };
      break;
    }
    case "category":
      updateData = {
        category_id: patch.category_id,
        attributes: patch.attributes as unknown as Json,
      };
      break;
  }

  const { error } = await supabase.from("listings").update(updateData).eq("id", listingId);
  if (error) throw error;
}
