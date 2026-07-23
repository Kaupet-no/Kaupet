import { z } from "zod";
import type { AttributeFilterValue } from "@/lib/category-filters";

export const stringArray = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}, z.array(z.string()));

export const conditionEnum = z.enum(["new", "like_new", "good", "acceptable", "for_parts"]);
export const conditionArray = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}, z.array(conditionEnum));

export const termGroupSchema = z.object({
  id: z.string(),
  mode: z.enum(["all", "any"]),
  exclude: z.boolean(),
  terms: z.array(z.string()),
});

export const searchSchema = z.object({
  q: z.string().optional().default(""),
  qMode: z.enum(["all", "any"]).optional().default("all"),
  extraGroups: z.array(termGroupSchema).optional().default([]),
  category: z.string().optional().default(""),
  categories: stringArray.optional().default([]),
  catMode: z.enum(["all", "any"]).optional().default("any"),
  conditions: conditionArray.optional().default([]),
  includeFree: z.coerce.boolean().optional().default(true),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["new", "price_asc", "price_desc"]).optional().default("new"),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().min(1).max(100).optional(),
  loc: z.string().optional(),
  // JSON-encoded Record<string, AttributeFilterValue> — category-specific
  // search parameters (e.g. Bil's "hestekrefter"), see category-filters.ts.
  attrs: z.string().optional().default(""),
});

/** Encodes attribute filter values into the `attrs` URL search param. */
export function encodeAttrFilters(values: Record<string, AttributeFilterValue>): string {
  return Object.keys(values).length === 0 ? "" : JSON.stringify(values);
}

/** Decodes the `attrs` URL search param back into attribute filter values. */
export function decodeAttrFilters(attrs: string | undefined): Record<string, AttributeFilterValue> {
  if (!attrs) return {};
  try {
    const parsed = JSON.parse(attrs);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export type SearchListing = {
  id: string;
  kaupet_code: string;
  title: string;
  subtitle: string | null;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  cover_path: string | null;
};

export type ListingsPage = {
  rows: SearchListing[];
  totalCount: number | null;
  nextOffset: number | null;
};

export function rowContainsTerm(
  l: { title: string | null; description: string | null; city: string | null },
  term: string,
): boolean {
  const needle = term.toLowerCase();
  return (
    !!l.title?.toLowerCase().includes(needle) ||
    !!l.description?.toLowerCase().includes(needle) ||
    !!l.city?.toLowerCase().includes(needle)
  );
}
