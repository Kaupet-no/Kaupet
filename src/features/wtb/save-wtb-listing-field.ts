import type { useServerFn } from "@tanstack/react-start";
import type { updateWtbListing } from "@/lib/wtb-listings.functions";
import type { WtbAttributeMap } from "./wtb-criteria-types";

export type WtbFieldPatch =
  | { group: "title"; title: string }
  | { group: "description"; description: string }
  | { group: "category"; category_id: string | null }
  | { group: "max_price"; max_price_nok: number | null }
  | { group: "attributes"; attributes: WtbAttributeMap };

/** Per-field autosave for inline WTB editing, mirroring
 * `saveListingField` — thin adapter over the existing `updateWtbListing`
 * server function, which already accepts partial updates. */
export async function saveWtbListingField(
  listingId: string,
  patch: WtbFieldPatch,
  updateFn: ReturnType<typeof useServerFn<typeof updateWtbListing>>,
): Promise<void> {
  switch (patch.group) {
    case "title":
      await updateFn({ data: { id: listingId, title: patch.title } });
      return;
    case "description":
      await updateFn({ data: { id: listingId, description: patch.description } });
      return;
    case "category":
      await updateFn({ data: { id: listingId, category_id: patch.category_id } });
      return;
    case "max_price":
      await updateFn({ data: { id: listingId, max_price_nok: patch.max_price_nok } });
      return;
    case "attributes":
      await updateFn({ data: { id: listingId, attributes: patch.attributes } });
      return;
  }
}
