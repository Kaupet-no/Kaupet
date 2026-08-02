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
  sort: z.enum(["new", "relevance", "price_asc", "price_desc"]).optional().default("new"),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().min(1).max(100).optional(),
  loc: z.string().optional(),
  // Compact-encoded Record<string, AttributeFilterValue> — category-specific
  // search parameters (e.g. Bil's "hestekrefter"), see category-filters.ts
  // and encodeAttrFilters/decodeAttrFilters below for the wire format.
  attrs: z.string().optional().default(""),
});

/**
 * Encodes attribute filter values into the `attrs` URL search param.
 *
 * Uses a compact `key:kind:payload` format (entries joined by `,`) rather
 * than JSON — TanStack Router's default search serializer re-JSON-encodes
 * any string value that happens to already be valid JSON, which turned a
 * plain JSON-encoded `attrs` value into a doubly-escaped, unreadable query
 * string (e.g. `%22%7B%5C%22brand%5C%22...`). This format isn't valid JSON,
 * so it round-trips through the URL untouched and reads as e.g.
 * `attrs=brand:t:Volvo`.
 */
export function encodeAttrFilters(values: Record<string, AttributeFilterValue>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) return "";
  return entries
    .map(([key, v]) => {
      switch (v.kind) {
        case "select":
          return `${key}:s:${encodeURIComponent(v.value)}`;
        case "multiselect":
          return `${key}:m:${v.values.map(encodeURIComponent).join("|")}`;
        case "boolean":
          return `${key}:b:${v.value ? "1" : "0"}`;
        case "range":
          return `${key}:r:${v.min ?? ""}-${v.max ?? ""}`;
        case "text":
          return `${key}:t:${encodeURIComponent(v.value)}`;
      }
    })
    .join(",");
}

/** Decodes the `attrs` URL search param back into attribute filter values. */
export function decodeAttrFilters(attrs: string | undefined): Record<string, AttributeFilterValue> {
  if (!attrs) return {};
  const result: Record<string, AttributeFilterValue> = {};
  for (const entry of attrs.split(",")) {
    const firstColon = entry.indexOf(":");
    const secondColon = entry.indexOf(":", firstColon + 1);
    if (firstColon < 0 || secondColon < 0) continue;
    const key = entry.slice(0, firstColon);
    const kind = entry.slice(firstColon + 1, secondColon);
    const payload = entry.slice(secondColon + 1);
    try {
      switch (kind) {
        case "s":
          result[key] = { kind: "select", value: decodeURIComponent(payload) };
          break;
        case "m":
          result[key] = {
            kind: "multiselect",
            values: payload.length > 0 ? payload.split("|").map(decodeURIComponent) : [],
          };
          break;
        case "b":
          result[key] = { kind: "boolean", value: payload === "1" };
          break;
        case "r": {
          const dash = payload.indexOf("-");
          if (dash < 0) break;
          const minStr = payload.slice(0, dash);
          const maxStr = payload.slice(dash + 1);
          result[key] = {
            kind: "range",
            min: minStr === "" ? undefined : Number(minStr),
            max: maxStr === "" ? undefined : Number(maxStr),
          };
          break;
        }
        case "t":
          result[key] = { kind: "text", value: decodeURIComponent(payload) };
          break;
      }
    } catch {
      // malformed entry — skip it
    }
  }
  return result;
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
