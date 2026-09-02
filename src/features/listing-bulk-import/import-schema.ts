import { z } from "zod";

import { attributesSchema } from "@/lib/category-filters";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

export const BULK_IMPORT_COLUMNS = [
  "external_id",
  "category",
  "title",
  "description",
  "price",
  "subtitle",
  "condition",
  "can_ship",
  "known_issues",
  "no_known_issues",
  "maintenance_history",
  "attributes",
] as const;

/**
 * Kolonner den gamle malen hadde, men som Kaupet ikke lenger leser:
 * bedriftsannonser bruker bedriftsadressen som lokasjon.
 */
export const RETIRED_IMPORT_COLUMNS: Record<string, string> = {
  postal_code:
    "Kolonnen postal_code brukes ikke lenger. Bedriftsannonser bruker bedriftsadressen som lokasjon — endre den i bedriftskonsollet.",
  city: "Kolonnen city brukes ikke lenger. Bedriftsannonser bruker bedriftsadressen som lokasjon — endre den i bedriftskonsollet.",
};

export type BulkImportRow = {
  rowNumber: number;
  externalId: string;
  category: string;
  title: string;
  description: string;
  priceNok: number;
  subtitle?: string;
  condition?: "new" | "like_new" | "good" | "acceptable" | "for_parts";
  canShip?: boolean;
  knownIssues?: string;
  noKnownIssues?: boolean;
  maintenanceHistory?: string;
  attributes: Record<string, string | number | boolean | string[]>;
};

/** Nedtrekksetikettene malen tilbyr, per `listings.condition`-verdi. */
export const CONDITION_LABELS_NB: Record<NonNullable<BulkImportRow["condition"]>, string> = {
  new: "Ny",
  like_new: "Som ny",
  good: "God",
  acceptable: "Akseptabel",
  for_parts: "Til deler",
};

/** Godtar både maskinverdien og den norske etiketten fra malens nedtrekksliste. */
export function parseCondition(value: unknown): BulkImportRow["condition"] | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase("nb-NO");
  if (!normalized) return undefined;
  const entry = Object.entries(CONDITION_LABELS_NB).find(
    ([machine, label]) => machine === normalized || label.toLocaleLowerCase("nb-NO") === normalized,
  );
  return entry?.[0] as BulkImportRow["condition"] | undefined;
}

export type BulkImportRowError = {
  rowNumber: number;
  field: string;
  message: string;
};

const rowSchema = z.object({
  externalId: z.string().trim().min(1, "Oppgi en ekstern ID.").max(120, "Ekstern ID er for lang."),
  category: z.string().trim().min(1, "Oppgi en kategori."),
  title: z
    .string()
    .trim()
    .min(5, "Tittelen må ha minst 5 tegn.")
    .max(120, "Tittelen kan ha maks 120 tegn."),
  description: z
    .string()
    .trim()
    .min(20, "Beskrivelsen må ha minst 20 tegn.")
    .max(4000, "Beskrivelsen kan ha maks 4000 tegn."),
  priceNok: z
    .number()
    .int("Prisen må være et helt tall i NOK.")
    .min(0, "Prisen kan ikke være negativ.")
    .max(10_000_000, "Prisen kan ikke være over 10 000 000 kr."),
  subtitle: z.string().trim().max(80, "Undertittelen kan ha maks 80 tegn.").optional(),
  condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]).optional(),
  canShip: z.boolean().optional(),
  knownIssues: z.string().trim().max(2000, "Kjente feil kan ha maks 2000 tegn.").optional(),
  noKnownIssues: z.boolean().optional(),
  maintenanceHistory: z
    .string()
    .trim()
    .max(2000, "Vedlikeholdshistorikk kan ha maks 2000 tegn.")
    .optional(),
  attributes: attributesSchema,
});

export function parsePriceNok(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isInteger(value) && Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/g, "");
  if (!text || !/^\d+(?:[.,]\d{1,2})?$/.test(text)) return undefined;
  const normalized = text.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return undefined;
  return amount;
}

export function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase("nb-NO");
  if (["ja", "yes", "true", "1", "begge", "frakt"].includes(normalized)) return true;
  if (["nei", "no", "false", "0", "kun henting"].includes(normalized)) return false;
  return undefined;
}

function errorFromIssue(rowNumber: number, issue: z.ZodIssue): BulkImportRowError {
  const field = String(issue.path[0] ?? "rad");
  return { rowNumber, field, message: issue.message };
}

export function validateBulkImportRow(input: unknown, rowNumber: number): BulkImportRowError[] {
  const parsed = rowSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => errorFromIssue(rowNumber, issue));
}

export function normalizeBulkImportRow(
  input: Record<string, unknown>,
  rowNumber: number,
): BulkImportRow {
  const attributes = input.attributes;
  return {
    rowNumber,
    externalId: String(input.externalId ?? "").trim(),
    category: String(input.category ?? "").trim(),
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    priceNok: typeof input.priceNok === "number" ? input.priceNok : Number(input.priceNok),
    ...(input.subtitle ? { subtitle: String(input.subtitle).trim() } : {}),
    ...(input.condition ? { condition: input.condition as BulkImportRow["condition"] } : {}),
    ...(input.canShip !== undefined ? { canShip: Boolean(input.canShip) } : {}),
    ...(input.knownIssues ? { knownIssues: String(input.knownIssues).trim() } : {}),
    ...(input.noKnownIssues !== undefined ? { noKnownIssues: Boolean(input.noKnownIssues) } : {}),
    ...(input.maintenanceHistory
      ? { maintenanceHistory: String(input.maintenanceHistory).trim() }
      : {}),
    attributes:
      attributes && typeof attributes === "object"
        ? (attributes as BulkImportRow["attributes"])
        : {},
  };
}

export const bulkImportRowSchema = rowSchema;
