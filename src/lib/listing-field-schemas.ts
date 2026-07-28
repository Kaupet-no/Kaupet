import { z } from "zod";

/**
 * Shared per-field zod schemas for listing title/description/etc, used by
 * both the create wizard (`ny-annonse.tsx`) and inline listing editing
 * (`src/features/listing-edit/`) — pulled out of the old
 * `mine-annonser.$id.rediger.tsx` schema so there's a single source of
 * truth instead of duplicated validation rules.
 */
export const TITLE_SCHEMA = z.string().trim().min(5).max(120);
export const SUBTITLE_SCHEMA = z.string().trim().max(80).optional().or(z.literal(""));
export const DESCRIPTION_SCHEMA = z.string().trim().min(20).max(4000);
export const CONDITION_SCHEMA = z
  .enum(["new", "like_new", "good", "acceptable", "for_parts"])
  .nullable()
  .optional();
export const PRICE_SCHEMA = z
  .union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")])
  .optional();
export const POSTAL_CODE_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
  .optional()
  .or(z.literal(""));
export const CITY_SCHEMA = z.string().trim().max(100).optional().or(z.literal(""));
export const KNOWN_ISSUES_SCHEMA = z.string().trim().max(2000).optional().or(z.literal(""));
export const MAINTENANCE_HISTORY_SCHEMA = z.string().trim().max(2000).optional().or(z.literal(""));
