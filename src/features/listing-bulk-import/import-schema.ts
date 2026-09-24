import { z } from "zod";

import { attributesSchema } from "@/lib/category-filters";
import { INTEGRATION_LIMITS } from "@/lib/integration-limits";
import { MAX_LISTING_IMAGES } from "@/lib/storage";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
/** Samme tall som håndheves server-/API-side (`INTEGRATION_LIMITS.maxBatchRows`),
 * gjenbrukt her slik at malen og klientparseren aldri kan avvike fra grensen. */
export const MAX_IMPORT_ROWS = INTEGRATION_LIMITS.maxBatchRows;
/** Samme grense som gjelder for bilder lastet opp gjennom veiviseren
 * (`MAX_LISTING_IMAGES` i `src/lib/storage.ts`), gjenbrukt her slik at
 * malen/parseren aldri kan avvike fra det som faktisk håndheves. */
export const MAX_IMPORT_IMAGES = MAX_LISTING_IMAGES;
/** Maks lengde på én bilde-URL i `images`-kolonnen. */
export const MAX_IMPORT_IMAGE_URL_LENGTH = 2048;

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
  "status",
  "images",
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
  /** Tom/ikke satt = ingen statusendring (en ny annonse blir aktiv). */
  status?: "active" | "sold" | "archived";
  /** Bilde-URL-er fra `images`-kolonnen, `;`-separert i filen. Serveren tar
   * foreløpig bare imot disse (se `// Steg 4:`-kommentaren i
   * `listing-sync.server.ts`) — selve bildehentingen er ikke bygget ennå. */
  imageUrls: string[];
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

/** Nedtrekksetikettene malens `status`-kolonne tilbyr, per `listings.status`-
 * verdi. Tom celle betyr «ingen endring», så `expired`/`disabled` har bevisst
 * ingen etikett her — de kan ikke settes fra filen. */
export const LISTING_STATUS_LABELS_NB: Record<NonNullable<BulkImportRow["status"]>, string> = {
  active: "Aktiv",
  sold: "Solgt",
  archived: "Arkivert",
};

/** Godtar både maskinverdien og den norske etiketten fra malens nedtrekksliste. */
export function parseListingStatus(value: unknown): BulkImportRow["status"] | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase("nb-NO");
  if (!normalized) return undefined;
  const entry = Object.entries(LISTING_STATUS_LABELS_NB).find(
    ([machine, label]) => machine === normalized || label.toLocaleLowerCase("nb-NO") === normalized,
  );
  return entry?.[0] as BulkImportRow["status"] | undefined;
}

/** `images`-kolonnen: bilde-URL-er skilt med semikolon. Tomme deler
 * ignoreres (f.eks. avsluttende `;`). */
export function parseImageUrls(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "");
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
  condition: z
    .enum(["new", "like_new", "good", "acceptable", "for_parts"], {
      errorMap: () => ({ message: "Ugyldig tilstand." }),
    })
    .optional(),
  canShip: z.boolean({ errorMap: () => ({ message: "Kan sendes må være ja/nei." }) }).optional(),
  knownIssues: z.string().trim().max(2000, "Kjente feil kan ha maks 2000 tegn.").optional(),
  noKnownIssues: z.boolean().optional(),
  maintenanceHistory: z
    .string()
    .trim()
    .max(2000, "Vedlikeholdshistorikk kan ha maks 2000 tegn.")
    .optional(),
  status: z
    .enum(["active", "sold", "archived"], {
      errorMap: () => ({ message: "Ugyldig status." }),
    })
    .optional(),
  imageUrls: z
    .array(
      z
        .string()
        .trim()
        .max(
          MAX_IMPORT_IMAGE_URL_LENGTH,
          `Bilde-URL kan ha maks ${MAX_IMPORT_IMAGE_URL_LENGTH} tegn.`,
        )
        .refine((value) => value.startsWith("https://"), {
          message: "Bilde-URL må starte med https://.",
        })
        .refine(
          (value) => {
            try {
              new URL(value);
              return true;
            } catch {
              return false;
            }
          },
          { message: "Bilde-URL er ikke en gyldig URL." },
        ),
    )
    .max(MAX_IMPORT_IMAGES, `Maks ${MAX_IMPORT_IMAGES} bilder per annonse.`)
    .default([]),
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
    ...(input.status ? { status: input.status as BulkImportRow["status"] } : {}),
    imageUrls: Array.isArray(input.imageUrls) ? input.imageUrls.map((url) => String(url)) : [],
    attributes:
      attributes && typeof attributes === "object"
        ? (attributes as BulkImportRow["attributes"])
        : {},
  };
}

export const bulkImportRowSchema = rowSchema;
