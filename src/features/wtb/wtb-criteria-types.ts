/** Value shapes for Ønskes kjøpt search criteria, stored in
 * `wtb_listings.attributes` (jsonb). Unlike a sell listing's attributes —
 * which describe one concrete item — a WTB criterion describes what the buyer
 * accepts, so selects hold several values, numerics hold a from–to range and
 * date filters (type `date`) hold an earliest-acceptable date. The server-side mirror
 * of this union lives in wtb-listings.functions.ts (`wtbAttributesSchema`). */

export type WtbRangeValue = { min?: number; max?: number };
export type WtbDateMinValue = { minDate: string };
export type WtbAttributeValue =
  string | number | boolean | string[] | WtbRangeValue | WtbDateMinValue;
export type WtbAttributeMap = Record<string, WtbAttributeValue>;

/** Reserved attributes key for the free-text criterion ("utstyrskode eller
 * annen relevant informasjon") — not a category_filters key. */
export const WTB_FREETEXT_KEY = "__freetext";

export function isWtbRangeValue(v: WtbAttributeValue | undefined): v is WtbRangeValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !("minDate" in v);
}

export function isWtbDateMinValue(v: WtbAttributeValue | undefined): v is WtbDateMinValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "minDate" in v;
}
