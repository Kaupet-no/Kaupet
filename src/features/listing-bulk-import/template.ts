import {
  effectiveFiltersForCategory,
  VEHICLE_EQUIPMENT_FILTER_KEYS,
  type CategoryFilter,
  type CategoryNode,
} from "@/lib/category-filters";
import { BULK_IMPORT_COLUMNS, CONDITION_LABELS_NB, MAX_IMPORT_ROWS } from "./import-schema";
import { PROFF_LOGO, proffLogoPng } from "./proff-logo";
import {
  columnLetter,
  definedName,
  STYLE,
  writeXlsx,
  type XlsxCell,
  type XlsxSheet,
} from "./xlsx-writer";

export type BulkImportTemplateCategory = CategoryNode & {
  name_nb: string;
  slug: string;
};

/** Første datarad i Annonser-arket: rad 1 er ledetekst, rad 2 er kolonnenavn. */
const FIRST_DATA_ROW = 3;
const LAST_DATA_ROW = FIRST_DATA_ROW + MAX_IMPORT_ROWS - 1;

type BaseColumn = {
  column: (typeof BULK_IMPORT_COLUMNS)[number];
  label: string;
  required: boolean;
  width: number;
  /** Definert navn for nedtrekkslisten, hvis kolonnen har en. */
  list?: string;
};

const BASE_COLUMNS: BaseColumn[] = [
  { column: "external_id", label: "Ekstern ID", required: true, width: 16 },
  { column: "category", label: "Kategori", required: true, width: 22, list: "Liste_kategori" },
  { column: "title", label: "Tittel", required: true, width: 32 },
  { column: "description", label: "Beskrivelse", required: true, width: 48 },
  { column: "price", label: "Pris (kr)", required: true, width: 12 },
  { column: "subtitle", label: "Undertittel", required: false, width: 24 },
  { column: "condition", label: "Tilstand", required: false, width: 16, list: "Liste_tilstand" },
  { column: "can_ship", label: "Kan sendes", required: false, width: 12, list: "Liste_janei" },
  { column: "known_issues", label: "Kjente feil", required: false, width: 28 },
  {
    column: "no_known_issues",
    label: "Ingen kjente feil",
    required: false,
    width: 14,
    list: "Liste_janei",
  },
  { column: "maintenance_history", label: "Vedlikeholdshistorikk", required: false, width: 28 },
  { column: "attributes", label: "Ekstra felt (JSON)", required: false, width: 30 },
];

/**
 * Kategorien som er valgt, pluss alle underkategoriene dens. Å velge en
 * hovedkategori betyr «alle underkategorier i denne hovedkategorien»: malen
 * får da kolonnene alle underkategoriene til sammen trenger, og
 * kategorinedtrekket viser bare kategorier innenfor dette treet.
 */
function categorySubtree(
  categories: BulkImportTemplateCategory[],
  rootId: string,
): BulkImportTemplateCategory[] {
  const childrenByParent = new Map<string, BulkImportTemplateCategory[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    const siblings = childrenByParent.get(category.parent_id) ?? [];
    siblings.push(category);
    childrenByParent.set(category.parent_id, siblings);
  }
  const root = categories.find((category) => category.id === rootId);
  if (!root) return [];
  const subtree: BulkImportTemplateCategory[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    subtree.push(current);
    queue.push(...(childrenByParent.get(current.id) ?? []));
  }
  return subtree;
}

/**
 * Kategoriene brukeren faktisk kan skrive i `category`-kolonnen: bladnodene i
 * treet. Er roten selv et blad, er det den ene gyldige verdien.
 */
function selectableCategories(subtree: BulkImportTemplateCategory[]): BulkImportTemplateCategory[] {
  const parents = new Set(subtree.map((category) => category.parent_id));
  const leaves = subtree.filter((category) => !parents.has(category.id));
  return leaves.length > 0 ? leaves : subtree;
}

/** Felter som ikke skal ha egen kolonne: søkeområder og utstyrsgruppene. */
function templateFiltersForCategory(
  categoryId: string,
  filters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): CategoryFilter[] {
  const excluded = new Set<string>(VEHICLE_EQUIPMENT_FILTER_KEYS);
  return effectiveFiltersForCategory(categoryId, filters, categoriesById).filter(
    (filter) => filter.type !== "range" && !excluded.has(filter.key),
  );
}

/**
 * Attributtkolonnene malen skal ha for et helt kategoritre: unionen av
 * feltene hver kategori i treet krever, uten duplikater.
 */
function templateFiltersForScope(
  scope: BulkImportTemplateCategory[],
  filters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): CategoryFilter[] {
  const byKey = new Map<string, CategoryFilter>();
  for (const category of scope) {
    for (const filter of templateFiltersForCategory(category.id, filters, categoriesById)) {
      if (!byKey.has(filter.key)) byKey.set(filter.key, filter);
    }
  }
  return [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order);
}

function filterLabel(filter: CategoryFilter): string {
  return filter.unit ? `${filter.label_nb} (${filter.unit})` : filter.label_nb;
}

function filterHint(filter: CategoryFilter): string {
  if (filter.type === "multiselect") return "Flere verdier skilles med semikolon (;).";
  if (filter.type === "boolean") return "ja eller nei.";
  if (filter.type === "number") return "Tall.";
  if (filter.depends_on_key) {
    return filter.depends_on_not_value
      ? `Gjelder når ${filter.depends_on_key} ikke er ${filter.depends_on_not_value}.`
      : `Gjelder når ${filter.depends_on_key} er ${filter.depends_on_value}.`;
  }
  return "";
}

function coverSheet(selected: BulkImportTemplateCategory | null, pickableCount: number): XlsxSheet {
  const blank = (count: number): XlsxCell[] =>
    Array.from({ length: count }, () => ({ v: "", s: STYLE.canvas }));
  const wide = (value: string, style: number): XlsxCell[] => [
    { v: "", s: STYLE.canvas },
    { v: value, s: style },
    ...blank(6),
  ];
  const step = (number: string, text: string): XlsxCell[] => wide(`${number} ${text}`, STYLE.body);
  const rows: XlsxCell[][] = [
    blank(8),
    // Rad 2 er tom: den ekte Kaupet Proff-logoen ligger som bilde over den.
    blank(8),
    blank(8),
    wide("Importmal for annonser", STYLE.title),
    wide(
      !selected
        ? "Denne malen dekker alle kategorier. Fyll ut én rad per annonse, så oppretter Kaupet dem samlet."
        : pickableCount > 1
          ? `Denne malen dekker «${selected.name_nb}» med alle ${pickableCount} underkategorier — kolonnene til høyre i Annonser-arket er feltene disse kategoriene til sammen trenger.`
          : `Denne malen er satt opp for kategorien «${selected.name_nb}» — kolonnene til høyre i Annonser-arket er feltene denne kategorien trenger.`,
      STYLE.body,
    ),
    blank(8),
    wide("Slik gjør du", STYLE.heading),
    step("1.", "Åpne arkfanen Annonser nederst i vinduet."),
    step(
      "2.",
      "Fyll ut én annonse per rad, fra og med rad 3. Rad 1 er ledeteksten og rad 2 er kolonnenavnet Kaupet leser — ikke endre, flytt eller slett de to radene.",
    ),
    step(
      "3.",
      "Celler med en pil på høyre side har nedtrekksmeny. Velg fra listen i stedet for å skrive selv.",
    ),
    step(
      "4.",
      "Oransje kolonneoverskrift betyr obligatorisk felt. Grønn betyr valgfritt — men noen kategorier krever likevel enkelte av dem.",
    ),
    step("5.", "Lagre filen som .xlsx, og last den opp under «Importer annonser» i Kaupet."),
    blank(8),
    wide("Godt å vite", STYLE.heading),
    wide(
      `Maks ${MAX_IMPORT_ROWS} annonser og 5 MB per fil. Pris oppgis i hele kroner. Bilder og bilde-URL-er importeres ikke — dem legger du til på annonsen etterpå.`,
      STYLE.muted,
    ),
    wide(
      "Ekstern ID er din egen referanse (varenummer, SKU eller lager-ID). Den må være unik i filen, og gjør at samme annonse kjennes igjen hvis du sender inn filen på nytt.",
      STYLE.muted,
    ),
    wide(
      "Arkfanen Kategorifelter viser hvilke felt hver kategori krever, og hvilke verdier som er lov. Arkfanen Kategorier viser kategoriene malen dekker. Sted settes ikke i filen — bedriftsannonser bruker bedriftsadressen.",
      STYLE.muted,
    ),
    blank(8),
    wide("Eksempel på en utfylt rad", STYLE.heading),
    [
      { v: "", s: STYLE.canvas },
      { v: "Ekstern ID", s: STYLE.headerPlain },
      { v: "Kategori", s: STYLE.headerPlain },
      { v: "Tittel", s: STYLE.headerPlain },
      { v: "Beskrivelse", s: STYLE.headerPlain },
      { v: "Pris (kr)", s: STYLE.headerPlain },
      ...blank(2),
    ],
    [
      { v: "", s: STYLE.canvas },
      { v: "SKU-1042", s: STYLE.cell },
      { v: "sykler", s: STYLE.cell },
      { v: "Rød hybridsykkel", s: STYLE.cell },
      { v: "Lite brukt hybridsykkel med gode bremser og nylig service.", s: STYLE.cell },
      { v: 4500, s: STYLE.examplePrice },
      ...blank(2),
    ],
    blank(8),
  ];
  return {
    name: "Start",
    rows,
    cols: [3, 20, 20, 26, 26, 14, 14, 14],
    rowHeights: {
      2: PROFF_LOGO.heightPx * 0.75 + 8,
      4: 30,
      5: 22,
      8: 32,
      9: 32,
      10: 32,
      11: 32,
      12: 32,
      15: 32,
      16: 32,
      17: 32,
    },
    merges: [
      "B4:H4",
      "B5:H5",
      "B7:H7",
      ...["8", "9", "10", "11", "12"].map((row) => `B${row}:H${row}`),
      "B14:H14",
      "B15:H15",
      "B16:H16",
      "B17:H17",
      "B19:H19",
    ],
    showGridLines: false,
    image: {
      png: proffLogoPng(),
      name: "Kaupet Proff",
      // Forankret i B2, samme celle ledeteksten under starter i.
      col: 1,
      row: 1,
      widthPx: PROFF_LOGO.widthPx,
      heightPx: PROFF_LOGO.heightPx,
    },
  };
}

function listingSheet(
  attributeFilters: CategoryFilter[],
  /** Feltnøkler som kreves av *hver* kategori i utvalget. Dekker malen flere
   * underkategorier, er et felt bare påkrevd for noen av dem — da merkes
   * kolonnen valgfri, og Kategorifelter-arket sier hvem som krever hva. */
  alwaysRequiredKeys: Set<string>,
): XlsxSheet {
  const attributeColumns = attributeFilters.map((filter) => ({
    filter,
    column: `attr:${filter.key}`,
    label: filterLabel(filter),
    required: alwaysRequiredKeys.has(filter.key),
  }));
  const labels: XlsxCell[] = [
    ...BASE_COLUMNS.map((base) => ({
      v: base.required ? `${base.label} *` : base.label,
      s: base.required ? STYLE.headerRequired : STYLE.headerOptional,
    })),
    ...attributeColumns.map((entry) => ({
      v: entry.required ? `${entry.label} *` : entry.label,
      s: entry.required ? STYLE.headerRequired : STYLE.headerOptional,
    })),
  ];
  const keys: XlsxCell[] = [
    ...BASE_COLUMNS.map((base) => ({ v: base.column as string, s: STYLE.code })),
    ...attributeColumns.map((entry) => ({ v: entry.column, s: STYLE.code })),
  ];
  const lastColumn = columnLetter(labels.length - 1);

  const validations: { sqref: string; formula: string }[] = [];
  BASE_COLUMNS.forEach((base, index) => {
    if (!base.list) return;
    const letter = columnLetter(index);
    validations.push({
      sqref: `${letter}${FIRST_DATA_ROW}:${letter}${LAST_DATA_ROW}`,
      formula: base.list,
    });
  });
  attributeColumns.forEach((entry, index) => {
    const letter = columnLetter(BASE_COLUMNS.length + index);
    const range = `${letter}${FIRST_DATA_ROW}:${letter}${LAST_DATA_ROW}`;
    if (entry.filter.type === "boolean") {
      validations.push({ sqref: range, formula: "Liste_janei" });
    } else if (entry.filter.type === "select" && entry.filter.options?.length) {
      validations.push({ sqref: range, formula: definedName("Liste", entry.filter.key) });
    }
  });

  return {
    name: "Annonser",
    rows: [labels, keys],
    cols: [
      ...BASE_COLUMNS.map((base) => base.width),
      ...attributeColumns.map((entry) => Math.min(Math.max(entry.label.length + 4, 14), 30)),
    ],
    rowHeights: { 1: 30, 2: 16 },
    freezeRows: 2,
    autoFilter: `A2:${lastColumn}2`,
    validations,
  };
}

function fieldReferenceSheet(
  scope: BulkImportTemplateCategory[],
  filters: CategoryFilter[],
  categoriesById: Map<string, CategoryNode>,
): XlsxSheet {
  const header = (
    ["Kategori", "Felt", "Kolonne", "Type", "Må fylles ut", "Tillatte verdier", "Merknad"] as const
  ).map((value) => ({ v: value as string, s: STYLE.headerPlain }));
  const rows: XlsxCell[][] = [header];
  for (const category of scope) {
    for (const filter of templateFiltersForCategory(category.id, filters, categoriesById)) {
      rows.push([
        { v: category.name_nb, s: STYLE.cell },
        { v: filterLabel(filter), s: STYLE.cell },
        { v: `attr:${filter.key}`, s: STYLE.code },
        { v: filter.type, s: STYLE.cell },
        { v: !filter.is_optional && !filter.depends_on_key ? "Ja" : "Nei", s: STYLE.cell },
        { v: (filter.options ?? []).map((option) => option.label_nb).join(", "), s: STYLE.cell },
        { v: filterHint(filter), s: STYLE.cell },
      ]);
    }
  }
  if (rows.length === 1) {
    rows.push([{ v: "Denne kategorien har ingen egne felt.", s: STYLE.cell }]);
  }
  return {
    name: "Kategorifelter",
    rows,
    cols: [22, 26, 26, 14, 13, 46, 40],
    rowHeights: { 1: 28 },
    freezeRows: 1,
    autoFilter: `A1:G${rows.length}`,
  };
}

function categorySheet(categories: BulkImportTemplateCategory[]): XlsxSheet {
  const names = new Map(categories.map((category) => [category.id, category.name_nb]));
  return {
    name: "Kategorier",
    rows: [
      (["Navn", "Slug (skriv denne i Annonser)", "Overkategori"] as const).map((value) => ({
        v: value as string,
        s: STYLE.headerPlain,
      })),
      ...categories.map((category) => [
        { v: category.name_nb, s: STYLE.cell },
        { v: category.slug, s: STYLE.cell },
        { v: category.parent_id ? (names.get(category.parent_id) ?? "") : "", s: STYLE.cell },
      ]),
    ],
    cols: [30, 30, 30],
    rowHeights: { 1: 28 },
    freezeRows: 1,
    autoFilter: `A1:C${categories.length + 1}`,
  };
}

/** Skjult ark med kildelistene som nedtrekksmenyene peker på. */
function listsSheet(
  categories: BulkImportTemplateCategory[],
  attributeFilters: CategoryFilter[],
): { sheet: XlsxSheet; names: Record<string, string> } {
  const columns: { name: string; values: string[] }[] = [
    { name: "Liste_kategori", values: categories.map((category) => category.slug) },
    { name: "Liste_tilstand", values: Object.values(CONDITION_LABELS_NB) },
    { name: "Liste_janei", values: ["ja", "nei"] },
    ...attributeFilters
      .filter((filter) => filter.type === "select" && filter.options?.length)
      .map((filter) => ({
        name: definedName("Liste", filter.key),
        values: (filter.options ?? []).map((option) => option.label_nb),
      })),
  ];
  const height = Math.max(...columns.map((column) => column.values.length));
  const rows: XlsxCell[][] = [columns.map((column) => column.name)];
  for (let index = 0; index < height; index += 1) {
    rows.push(columns.map((column) => column.values[index] ?? null));
  }
  const names: Record<string, string> = {};
  columns.forEach((column, index) => {
    if (column.values.length === 0) return;
    const letter = columnLetter(index);
    names[column.name] = `Lister!$${letter}$2:$${letter}$${column.values.length + 1}`;
  });
  return { sheet: { name: "Lister", rows, hidden: true }, names };
}

export function generateBulkImportXlsxTemplate({
  categories,
  filters = [],
  categoryId = null,
}: {
  categories: BulkImportTemplateCategory[];
  filters?: CategoryFilter[];
  /** Valgt kategori. Er den en hovedkategori, dekker malen hele treet under den. */
  categoryId?: string | null;
}): ArrayBuffer {
  const categoriesById = new Map<string, CategoryNode>(
    categories.map((category) => [category.id, category]),
  );
  const selected = categories.find((category) => category.id === categoryId) ?? null;
  const scope = selected ? categorySubtree(categories, selected.id) : categories;
  const pickable = selected ? selectableCategories(scope) : categories;
  const attributeFilters = selected
    ? templateFiltersForScope(pickable, filters, categoriesById)
    : [];
  const requiredKeysPerCategory = pickable.map(
    (category) =>
      new Set(
        templateFiltersForCategory(category.id, filters, categoriesById)
          .filter((filter) => !filter.is_optional && !filter.depends_on_key)
          .map((filter) => filter.key),
      ),
  );
  const alwaysRequiredKeys = new Set(
    attributeFilters
      .map((filter) => filter.key)
      .filter((key) => requiredKeysPerCategory.every((keys) => keys.has(key))),
  );
  const lists = listsSheet(pickable, attributeFilters);
  return writeXlsx(
    [
      coverSheet(selected, pickable.length),
      listingSheet(attributeFilters, alwaysRequiredKeys),
      fieldReferenceSheet(pickable, filters, categoriesById),
      categorySheet(pickable),
      lists.sheet,
    ],
    lists.names,
  );
}

export function templateFileName(category: BulkImportTemplateCategory | null): string {
  const suffix = category ? `-${category.slug}` : "";
  return `kaupet-proff-importmal${suffix}.xlsx`;
}

export function downloadBulkImportXlsxTemplate(options: {
  categories: BulkImportTemplateCategory[];
  filters?: CategoryFilter[];
  categoryId?: string | null;
}): void {
  const bytes = generateBulkImportXlsxTemplate(options);
  const selected =
    options.categories.find((category) => category.id === options.categoryId) ?? null;
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = templateFileName(selected);
  anchor.click();
  URL.revokeObjectURL(url);
}
