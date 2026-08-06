/** Value shapes for Ønskes kjøpt search criteria, stored in
 * `wtb_listings.attributes` (jsonb). Unlike a sell listing's attributes —
 * which describe one concrete item — a WTB criterion describes what the buyer
 * accepts, so selects hold several values, numerics hold a from–to range and
 * `next_eu_control` holds an earliest-acceptable date. The server-side mirror
 * of this union lives in wtb-listings.functions.ts (`wtbAttributesSchema`). */

export type WtbRangeValue = { min?: number; max?: number };
export type WtbDateMinValue = { minDate: string };
export type WtbAttributeValue =
  string | number | boolean | string[] | WtbRangeValue | WtbDateMinValue;
export type WtbAttributeMap = Record<string, WtbAttributeValue>;

/** Reserved attributes key for the free-text criterion ("utstyrskode eller
 * annen relevant informasjon") — not a category_filters key. */
export const WTB_FREETEXT_KEY = "__freetext";

/** category_filters key for the vehicle EU-control deadline; the one criterion
 * rendered as an earliest-date picker instead of a range/select. */
export const EU_CONTROL_KEY = "next_eu_control";

export function isWtbRangeValue(v: WtbAttributeValue | undefined): v is WtbRangeValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !("minDate" in v);
}

export function isWtbDateMinValue(v: WtbAttributeValue | undefined): v is WtbDateMinValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "minDate" in v;
}

/** Keys the user has activated (checkbox) without filling a value — these
 * block the wizard's "Neste" until filled or deactivated. Empty values are
 * always deleted from the map, so "in the map" means "has a value". */
export function wtbInvalidCheckedKeys(
  checkedKeys: readonly string[],
  attributes: WtbAttributeMap,
): string[] {
  return checkedKeys.filter((k) => !(k in attributes));
}
