import type { CategoryFilter, FilterType } from "@/lib/category-filters";
import {
  BULK_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  RETIRED_IMPORT_COLUMNS,
  normalizeBulkImportRow,
  CONDITION_LABELS_NB,
  parseBoolean,
  parseCondition,
  parsePriceNok,
  validateBulkImportRow,
  type BulkImportRow,
  type BulkImportRowError,
} from "./import-schema";

export { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS };

export type ParsedBulkImport = {
  fileName: string;
  rows: BulkImportRow[];
  errors: BulkImportRowError[];
};

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

const requiredColumns = new Set(["external_id", "category", "title", "description", "price"]);
const supportedExtensions = /\.(csv|xlsx)$/iu;
/** Kolonneprefiks for kategoriattributter, f.eks. `attr:fuel_type`. */
const ATTRIBUTE_PREFIX = "attr:";

/**
 * Hvordan én attributtkolonne skal tolkes. Typen avgjør om verdien blir
 * tall, boolean eller liste, og `options` oversetter den norske etiketten
 * malens nedtrekksmeny viser tilbake til verdien som lagres på annonsen.
 */
export type AttributeMeta = Record<string, { type: FilterType; options?: Record<string, string> }>;

/**
 * Bygger tolkningstabellen fra `category_filters`. Nøkler går igjen på tvers
 * av kategorier med samme type og samme valg, så én flat tabell holder.
 */
export function attributeMetaFromFilters(filters: CategoryFilter[]): AttributeMeta {
  const meta: AttributeMeta = {};
  for (const filter of filters) {
    const options = Object.fromEntries(
      (filter.options ?? []).map((option) => [
        option.label_nb.trim().toLocaleLowerCase("nb-NO"),
        option.value,
      ]),
    );
    meta[filter.key] = {
      type: filter.type,
      ...(Object.keys(options).length > 0 ? { options } : {}),
    };
  }
  return meta;
}

function parseAttributeCell(
  value: string,
  meta: AttributeMeta[string] | undefined,
): string | number | boolean | string[] | undefined {
  const text = value.trim();
  if (text === "") return undefined;
  const toValue = (label: string) =>
    meta?.options?.[label.trim().toLocaleLowerCase("nb-NO")] ?? label.trim();
  switch (meta?.type) {
    case "multiselect":
      return text
        .split(";")
        .map((part) => toValue(part))
        .filter((part) => part !== "");
    case "boolean":
      return parseBoolean(text);
    case "number": {
      const amount = Number(text.replaceAll(/\s/gu, "").replace(",", "."));
      return Number.isFinite(amount) ? amount : undefined;
    }
    default:
      return toValue(text);
  }
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function parseCsvRows(text: string, delimiter: ";" | ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !quoted) {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new ImportFileError("CSV-filen har et uavsluttet tekstfelt.");
  if (cell !== "" || row.length > 0) {
    row.push(cell.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): ";" | "," {
  const firstRow = text.split(/\r?\n/u).find((line) => line.trim() !== "") ?? "";
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of firstRow) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") commas += 1;
    else if (!quoted && char === ";") semicolons += 1;
  }
  if (commas === 0 && semicolons === 0) {
    throw new ImportFileError("Fant ingen overskriftsrad med CSV-skilletegn (, eller ;).");
  }
  return semicolons >= commas ? ";" : ",";
}

function parseCsv(text: string): string[][] {
  return parseCsvRows(text, detectDelimiter(text));
}

function parseAttributes(value: unknown): Record<string, string | number | boolean | string[]> {
  if (value == null || String(value).trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new ImportFileError("Kolonnen attributes må være gyldig JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ImportFileError("Kolonnen attributes må være et JSON-objekt.");
  }
  return parsed as Record<string, string | number | boolean | string[]>;
}
function parseOptionalBoolean(
  value: string,
  field: string,
  rowNumber: number,
  errors: BulkImportRowError[],
): boolean | undefined {
  if (value.trim() === "") return undefined;
  const parsed = parseBoolean(value);
  if (parsed === undefined) {
    errors.push({
      rowNumber,
      field,
      message: "Bruk ja/nei, true/false eller 1/0.",
    });
  }
  return parsed;
}

function normalizeHeader(row: string[]): string[] {
  return row.map((cell) => cell.trim().toLocaleLowerCase("nb-NO"));
}

function mapRows(
  rawRows: unknown[][],
  fileName: string,
  attributeMeta: AttributeMeta,
): ParsedBulkImport {
  const rows = rawRows.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
  // Malen har en ledetekstrad over kolonnenavnene, så overskriften er den
  // første raden som faktisk inneholder de obligatoriske kolonnene — ikke
  // bare den første raden med innhold.
  const headerIndex = rows.findIndex((row) => {
    const columns = new Set(normalizeHeader(row));
    return [...requiredColumns].every((column) => columns.has(column));
  });
  if (headerIndex === -1) {
    const firstRow = rows.find((row) => !isEmptyRow(row));
    if (!firstRow) throw new ImportFileError("Filen mangler en overskriftsrad.");
    const missing = [...requiredColumns].filter(
      (column) => !normalizeHeader(firstRow).includes(column),
    );
    throw new ImportFileError(`Filen mangler obligatoriske kolonner: ${missing.join(", ")}.`);
  }

  const headers = normalizeHeader(rows[headerIndex]);
  const duplicateHeaders = headers.filter((value, index) => headers.indexOf(value) !== index);
  if (duplicateHeaders.length > 0) {
    throw new ImportFileError(
      `Overskriften er duplisert: ${[...new Set(duplicateHeaders)].join(", ")}.`,
    );
  }
  const attributeKeys = new Map(
    headers.flatMap((column, index) =>
      column.startsWith(ATTRIBUTE_PREFIX) && column.length > ATTRIBUTE_PREFIX.length
        ? [[index, column.slice(ATTRIBUTE_PREFIX.length)] as const]
        : [],
    ),
  );
  const retired = headers.filter((column) => column in RETIRED_IMPORT_COLUMNS);
  if (retired.length > 0) {
    throw new ImportFileError(RETIRED_IMPORT_COLUMNS[retired[0]]);
  }
  const unknown = headers.filter(
    (column, index) =>
      !attributeKeys.has(index) &&
      !BULK_IMPORT_COLUMNS.includes(column as (typeof BULK_IMPORT_COLUMNS)[number]),
  );
  if (unknown.length > 0) {
    throw new ImportFileError(`Ukjente kolonner: ${[...new Set(unknown)].join(", ")}.`);
  }

  const dataRows = rows
    .slice(headerIndex + 1)
    .map((row, index) => ({ row, rowNumber: headerIndex + index + 2 }))
    .filter(({ row }) => !isEmptyRow(row));
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Filen kan inneholde maksimalt ${MAX_IMPORT_ROWS} annonser.`);
  }

  const errors: BulkImportRowError[] = [];
  const parsedRows: BulkImportRow[] = [];
  const externalIds = new Set<string>();
  for (const { row: values, rowNumber } of dataRows) {
    const raw = Object.fromEntries(
      headers.map((column, columnIndex) => [column, values[columnIndex] ?? ""]),
    );
    const rowErrorStart = errors.length;
    let attributes: Record<string, string | number | boolean | string[]> = {};
    let attributesError = false;
    try {
      attributes = parseAttributes(raw.attributes);
    } catch (error) {
      attributesError = true;
      errors.push({ rowNumber, field: "attributes", message: (error as Error).message });
    }
    for (const [columnIndex, key] of attributeKeys) {
      const parsedValue = parseAttributeCell(values[columnIndex] ?? "", attributeMeta[key]);
      if (parsedValue === undefined) {
        if ((values[columnIndex] ?? "").trim() !== "") {
          errors.push({
            rowNumber,
            field: `${ATTRIBUTE_PREFIX}${key}`,
            message: "Verdien kunne ikke tolkes. Velg fra nedtrekkslisten i malen.",
          });
        }
        continue;
      }
      attributes[key] = parsedValue;
    }
    const conditionCell = (raw.condition ?? "").trim();
    const condition = parseCondition(conditionCell);
    if (conditionCell !== "" && condition === undefined) {
      errors.push({
        rowNumber,
        field: "condition",
        message: `Ukjent tilstand. Velg en av: ${Object.values(CONDITION_LABELS_NB).join(", ")}.`,
      });
    }
    const input = {
      externalId: raw.external_id,
      category: raw.category,
      title: raw.title,
      description: raw.description,
      priceNok: parsePriceNok(raw.price),
      subtitle: raw.subtitle || undefined,
      condition,
      canShip: parseOptionalBoolean(raw.can_ship ?? "", "can_ship", rowNumber, errors),
      knownIssues: raw.known_issues || undefined,
      noKnownIssues: parseOptionalBoolean(
        raw.no_known_issues ?? "",
        "no_known_issues",
        rowNumber,
        errors,
      ),
      maintenanceHistory: raw.maintenance_history || undefined,
      attributes,
    };
    const rowErrors = validateBulkImportRow(input, rowNumber);
    errors.push(...rowErrors);
    const externalId = String(raw.external_id ?? "").trim();
    const duplicateExternalId = externalId !== "" && externalIds.has(externalId);
    if (duplicateExternalId) {
      errors.push({ rowNumber, field: "external_id", message: "Ekstern ID må være unik i filen." });
    }
    if (externalId) externalIds.add(externalId);
    if (errors.length === rowErrorStart && !attributesError && !duplicateExternalId) {
      parsedRows.push(normalizeBulkImportRow(input, rowNumber));
    }
  }
  return { fileName, rows: parsedRows, errors };
}

async function parseXlsx(file: File): Promise<unknown[][]> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      sheetRows: MAX_IMPORT_ROWS + 3,
    });
    if (workbook.SheetNames.length === 0) {
      throw new ImportFileError("Excel-filen mangler et regneark.");
    }
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
      });
      const hasImportHeader = rows.some((row) => {
        const headers = new Set(row.map((cell) => String(cell).trim().toLocaleLowerCase("nb-NO")));
        return [...requiredColumns].every((column) => headers.has(column));
      });
      if (hasImportHeader) return rows;
    }
    throw new ImportFileError("Excel-filen mangler et ark med importkolonnene.");
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw new ImportFileError("Excel-filen er skadet eller passordbeskyttet.");
  }
}

export async function parseImportFile(
  file: File,
  attributeMeta: AttributeMeta = {},
): Promise<ParsedBulkImport> {
  if (!supportedExtensions.test(file.name))
    throw new ImportFileError("Velg en .csv- eller .xlsx-fil.");
  if (file.size > MAX_IMPORT_FILE_BYTES)
    throw new ImportFileError("Filen kan ikke være større enn 5 MB.");
  const extension = file.name.toLocaleLowerCase("nb-NO");
  const rawRows = extension.endsWith(".xlsx")
    ? await parseXlsx(file)
    : parseCsv((await file.text()).replace(/^\uFEFF/u, ""));
  return mapRows(rawRows, file.name, attributeMeta);
}
