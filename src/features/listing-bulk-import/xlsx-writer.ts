/**
 * Minimal OOXML (.xlsx) writer for Proff-importmalen.
 *
 * Appen har allerede SheetJS (`xlsx`) for å *lese* opplastede filer, men
 * community-bygget kan ikke *skrive* cellestiler, låste ruter eller
 * dataValidering — og det er nettopp det malen trenger (profilert forside,
 * kategorinedtrekk). ExcelJS kan det, men sprenger 450 KiB-budsjettet som
 * `scripts/check-bundle-budget.mjs` håndhever, så de få XML-delene vi
 * trenger skrives direkte her i stedet.
 *
 * Omfanget er bevisst smalt: inline-strenger, en fast stilpalett (se STYLE),
 * kolonnebredder, sammenslåtte celler, låst overskriftsrad, autofilter og
 * listebasert dataValidering. Ingen sharedStrings, formler eller bilder.
 */

export type XlsxCell = { v: string | number; s?: number } | string | number | null;

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  /** Kolonnebredder i tegn, fra venstre. */
  cols?: number[];
  /** Radhøyder i punkt, nøkkel er 1-indeksert radnummer. */
  rowHeights?: Record<number, number>;
  /** Sammenslåtte områder, f.eks. `"A1:F1"`. */
  merges?: string[];
  /** Antall rader som låses øverst. */
  freezeRows?: number;
  /** Område for autofilter, f.eks. `"A2:N2"`. */
  autoFilter?: string;
  /** Listevalidering; `formula` er et definert navn eller `"a,b,c"`. */
  validations?: { sqref: string; formula: string }[];
  showGridLines?: boolean;
  hidden?: boolean;
  /** Ett PNG-bilde forankret til en celle, i piksler ved 96 dpi. */
  image?: {
    png: Uint8Array;
    name: string;
    col: number;
    row: number;
    widthPx: number;
    heightPx: number;
  };
};

/** Stilindekser inn i `cellXfs`-tabellen som `stylesXml()` bygger. */
export const STYLE = {
  default: 0,
  heading: 1,
  body: 2,
  muted: 3,
  title: 4,
  canvas: 5,
  headerRequired: 6,
  headerOptional: 7,
  headerPlain: 8,
  cell: 9,
  code: 10,
  examplePrice: 11,
} as const;

/**
 * Design-tokenene fra `src/styles.css` (lys palett) som sRGB. Excel forstår
 * ikke oklch, så verdiene er lest ut av nettleseren én gang og skrevet ned
 * her — endres et token i styles.css, må det speiles hit.
 */
const COLOR = {
  primary: "FF194430",
  brand: "FFDF6C32",
  background: "FFFEFAF1",
  foreground: "FF121E14",
  mutedForeground: "FF5D665B",
  muted: "FFF0EAE0",
  border: "FFC5BDB0",
  white: "FFFFFFFF",
} as const;

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** Kontrolltegn Excel avviser i inline-strenger. */
// eslint-disable-next-line no-control-regex -- de skal nettopp matches og fjernes
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu;

export function columnLetter(index: number): string {
  let rest = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (rest % 26)) + letters;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return letters;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(CONTROL_CHARS, "");
}

/** Definerte navn i Excel tillater bokstaver, tall og understrek, og kan ikke starte med et tall. */
export function definedName(prefix: string, key: string): string {
  return `${prefix}_${key.replaceAll(/[^A-Za-z0-9_]/gu, "_")}`;
}

function cellXml(cell: XlsxCell, ref: string): string {
  const normalized = cell == null || typeof cell === "object" ? cell : { v: cell };
  if (!normalized) return "";
  const style = normalized.s ? ` s="${normalized.s}"` : "";
  if (typeof normalized.v === "number") {
    return `<c r="${ref}"${style}><v>${normalized.v}</v></c>`;
  }
  if (normalized.v === "") return `<c r="${ref}"${style}/>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(normalized.v)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const view =
    `<sheetView${sheet.showGridLines === false ? ' showGridLines="0"' : ""} workbookViewId="0">` +
    (sheet.freezeRows
      ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="A${sheet.freezeRows + 1}" sqref="A${sheet.freezeRows + 1}"/>`
      : "") +
    "</sheetView>";
  const cols = sheet.cols?.length
    ? `<cols>${sheet.cols
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const height = sheet.rowHeights?.[rowNumber];
      const attrs = height ? ` ht="${height}" customHeight="1"` : "";
      const body = cells
        .map((cell, columnIndex) => cellXml(cell, `${columnLetter(columnIndex)}${rowNumber}`))
        .join("");
      return `<row r="${rowNumber}"${attrs}>${body}</row>`;
    })
    .join("");
  // Rekkefølgen under følger CT_Worksheet-sekvensen; Excel avviser alt annet.
  const autoFilter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "";
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join("")}</mergeCells>`
    : "";
  const validations = sheet.validations?.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations
        .map(
          (validation) =>
            `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${validation.sqref}">` +
            `<formula1>${escapeXml(validation.formula)}</formula1></dataValidation>`,
        )
        .join("")}</dataValidations>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="${NS}" xmlns:r="${REL_NS}">` +
    `<sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
    `${cols}<sheetData>${rows}</sheetData>${autoFilter}${merges}${validations}` +
    `${sheet.image ? '<drawing r:id="rId1"/>' : ""}</worksheet>`
  );
}

function stylesXml(): string {
  const fonts = [
    `<font><sz val="11"/><color rgb="${COLOR.foreground}"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="${COLOR.white}"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="14"/><color rgb="${COLOR.primary}"/><name val="Calibri"/></font>`,
    `<font><sz val="10"/><color rgb="${COLOR.mutedForeground}"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="20"/><color rgb="${COLOR.primary}"/><name val="Calibri"/></font>`,
    `<font><sz val="10"/><color rgb="${COLOR.mutedForeground}"/><name val="Consolas"/></font>`,
    `<font><i/><sz val="10"/><color rgb="${COLOR.mutedForeground}"/><name val="Calibri"/></font>`,
  ];
  const solid = (rgb: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    solid(COLOR.background),
    solid(COLOR.primary),
    solid(COLOR.brand),
    solid(COLOR.muted),
  ];
  const edge = (side: string) => `<${side} style="thin"><color rgb="${COLOR.border}"/></${side}>`;
  const borders = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    `<border>${edge("left")}${edge("right")}${edge("top")}${edge("bottom")}<diagonal/></border>`,
  ];
  const xf = (font: number, fill: number, border: number, alignment = "", numFmt = 0): string =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
    ` applyFont="1" applyFill="1" applyBorder="1"${alignment ? ' applyAlignment="1"' : ""}` +
    `${numFmt ? ' applyNumberFormat="1"' : ""}>${alignment}</xf>`;
  const wrapTop = '<alignment vertical="top" wrapText="1"/>';
  const centerWrap = '<alignment horizontal="center" vertical="center" wrapText="1"/>';
  const leftCenter = '<alignment horizontal="left" vertical="center" wrapText="1"/>';
  // Rekkefølgen her ER STYLE-indeksene.
  const cellXfs = [
    xf(0, 0, 0),
    xf(2, 2, 0, '<alignment vertical="center"/>'),
    xf(0, 2, 0, wrapTop),
    xf(3, 2, 0, wrapTop),
    xf(4, 2, 0, '<alignment vertical="center"/>'),
    xf(0, 2, 0),
    xf(1, 4, 1, centerWrap),
    xf(1, 3, 1, centerWrap),
    xf(1, 3, 1, leftCenter),
    xf(0, 0, 1, wrapTop),
    xf(5, 5, 1, wrapTop),
    xf(6, 0, 1, '<alignment vertical="top"/>', 3),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}">` +
    `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
    `<fills count="${fills.length}">${fills.join("")}</fills>` +
    `<borders count="${borders.length}">${borders.join("")}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${cellXfs.length}">${cellXfs.join("")}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  );
}

/** 1 piksel ved 96 dpi i EMU (English Metric Units). */
const EMU_PER_PX = 9525;

function drawingXml(image: NonNullable<XlsxSheet["image"]>): string {
  const cx = image.widthPx * EMU_PER_PX;
  const cy = image.heightPx * EMU_PER_PX;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    "<xdr:oneCellAnchor><xdr:from>" +
    `<xdr:col>${image.col}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${image.row}</xdr:row><xdr:rowOff>0</xdr:rowOff>` +
    `</xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic>` +
    `<xdr:nvPicPr><xdr:cNvPr id="1" name="${escapeXml(image.name)}" descr="${escapeXml(image.name)}"/>` +
    '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    `<xdr:blipFill><a:blip xmlns:r="${REL_NS}" r:embed="rId1"/>` +
    "<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>" +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
    "</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>"
  );
}

function workbookXml(sheets: XlsxSheet[], names: Record<string, string>): string {
  const sheetTags = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}"` +
        `${sheet.hidden ? ' state="hidden"' : ""} r:id="rId${index + 1}"/>`,
    )
    .join("");
  const entries = Object.entries(names);
  const definedNames = entries.length
    ? `<definedNames>${entries
        .map(
          ([name, ref]) => `<definedName name="${escapeXml(name)}">${escapeXml(ref)}</definedName>`,
        )
        .join("")}</definedNames>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets>${sheetTags}</sheets>${definedNames}</workbook>`
  );
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * ZIP-skriver, kun lagrede (ukomprimerte) oppføringer. Malen er noen hundre
 * KiB XML på det meste, og å hoppe over DEFLATE holder denne filen kort.
 * ponytail: legg til CompressionStream("deflate-raw") hvis filstørrelsen blir et problem.
 */
function zip(files: { name: string; data: Uint8Array }[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 filnavn
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, nameBytes.length, true);
    locals.push(new Uint8Array(local.buffer), nameBytes, file.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, file.data.length, true);
    central.setUint32(24, file.data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + file.data.length;
  }
  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output.buffer;
}

export function writeXlsx(sheets: XlsxSheet[], names: Record<string, string> = {}): ArrayBuffer {
  const encoder = new TextEncoder();
  const sheetPaths = sheets.map((_, index) => `xl/worksheets/sheet${index + 1}.xml`);
  const withImages = sheets
    .map((sheet, index) => ({ sheet, index }))
    .filter((entry): entry is { sheet: XlsxSheet & { image: object }; index: number } =>
      Boolean(entry.sheet.image),
    );
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (withImages.length > 0 ? '<Default Extension="png" ContentType="image/png"/>' : "") +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheetPaths
      .map(
        (path) =>
          `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    withImages
      .map(
        ({ index }) =>
          `<Override PartName="/xl/drawings/drawing${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      )
      .join("") +
    "</Types>";
  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`;
  const relationships = (id: string, type: string, target: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="${id}" Type="${REL_NS}/${type}" Target="${target}"/></Relationships>`;

  return zip([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml(sheets, names)) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml()) },
    ...sheets.map((sheet, index) => ({
      name: sheetPaths[index],
      data: encoder.encode(sheetXml(sheet)),
    })),
    ...withImages.flatMap(({ sheet, index }) => {
      const image = sheet.image as NonNullable<XlsxSheet["image"]>;
      return [
        {
          name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
          data: encoder.encode(
            relationships("rId1", "drawing", `../drawings/drawing${index + 1}.xml`),
          ),
        },
        {
          name: `xl/drawings/drawing${index + 1}.xml`,
          data: encoder.encode(drawingXml(image)),
        },
        {
          name: `xl/drawings/_rels/drawing${index + 1}.xml.rels`,
          data: encoder.encode(relationships("rId1", "image", `../media/image${index + 1}.png`)),
        },
        { name: `xl/media/image${index + 1}.png`, data: image.png },
      ];
    }),
  ]);
}
