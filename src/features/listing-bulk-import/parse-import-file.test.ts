import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  ImportFileError,
  parseImportFile,
} from "./parse-import-file";
import { parsePriceNok, validateBulkImportRow } from "./import-schema";
import { validateSyncRow, type SyncContext } from "./listing-sync.server";
import { normalizeFilter } from "@/lib/category-filters";

const baseHeader = "external_id;category;title;description;price";
const validRow = "id-1;sykler;En sykkel;Dette er en god beskrivelse av varen.;4500";

function file(name: string, text: string): File {
  return new File([text], name, { type: "text/csv" });
}

describe("bulk import parser", () => {
  it("leser BOM og både semikolon- og kommaseparerte CSV-filer", async () => {
    const semicolon = await parseImportFile(
      file("annonser.csv", `\uFEFF${baseHeader}\n${validRow}\n`),
    );
    const comma = await parseImportFile(
      file(
        "annonser.csv",
        "external_id,category,title,description,price\nid-2,sykler,En sykkel,Dette er en god beskrivelse av varen.,4500\n",
      ),
    );
    expect(semicolon.rows[0]?.externalId).toBe("id-1");
    expect(comma.rows[0]?.externalId).toBe("id-2");
  });

  it("hopper over tomme rader og avviser duplikate eksterne ID-er", async () => {
    const parsed = await parseImportFile(
      file("annonser.csv", `${baseHeader}\n${validRow}\n\n${validRow}\n`),
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([
      { rowNumber: 4, field: "external_id", message: "Ekstern ID må være unik i filen." },
    ]);
  });

  it("viser manglende og ukjente overskrifter som filfeil", async () => {
    await expect(
      parseImportFile(file("annonser.csv", "external_id;category;title\n")),
    ).rejects.toThrow("obligatoriske kolonner");
    await expect(
      parseImportFile(file("annonser.csv", `${baseHeader};titlte\n${validRow};x`)),
    ).rejects.toThrow("Ukjente kolonner");
  });

  it("normaliserer pris og avviser negative, tvetydige og brøkverdier", () => {
    expect(parsePriceNok("1 500")).toBe(1500);
    expect(parsePriceNok("1500,00")).toBe(1500);
    expect(parsePriceNok("-1")).toBeUndefined();
    expect(parsePriceNok("1.500,00")).toBeUndefined();
    expect(
      validateBulkImportRow(
        {
          externalId: "x",
          category: "sykler",
          title: "En sykkel",
          description: "Dette er en god beskrivelse av varen.",
          priceNok: 10.5,
          attributes: {},
        },
        2,
      ),
    ).toEqual([{ rowNumber: 2, field: "priceNok", message: "Prisen må være et helt tall i NOK." }]);
  });

  it("avviser ukjente boolske verdier", async () => {
    const parsed = await parseImportFile(
      file("annonser.csv", `${baseHeader};can_ship\n${validRow};kanskje\n`),
    );
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors).toContainEqual({
      rowNumber: 2,
      field: "can_ship",
      message: "Bruk ja/nei, true/false eller 1/0.",
    });
  });

  it("leser første ark i XLSX", async () => {
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["external_id", "category", "title", "description", "price"],
        ["xlsx-1", "sykler", "En sykkel", "Dette er en god beskrivelse av varen.", "4500"],
      ]),
      "Første",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["external_id"], ["ignored"]]),
      "Andre",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const parsed = await parseImportFile(new File([bytes], "annonser.xlsx"));
    expect(parsed.rows[0]?.externalId).toBe("xlsx-1");
  });

  it.each(["m/d/yy", "mm/dd/yyyy", "dd.mm.yyyy", "yyyy-mm-dd"])(
    "godtar Excel-datoer med celleformat %s gjennom servervalidering (ekvivalensklasser)",
    async (dateFormat) => {
      const XLSX = await import("@e965/xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([
        [
          ...baseHeader.split(";"),
          "attr:next_eu_control",
          "attr:first_registration_date",
          "condition",
          "can_ship",
        ],
        [
          "xlsx-dato",
          "sykler",
          "En sykkel",
          "Dette er en god beskrivelse av varen.",
          4500,
          new Date("2027-05-31T00:00:00Z"),
          new Date("2018-03-08T00:00:00Z"),
          "good",
          "true",
        ],
      ]);
      sheet.F2.z = dateFormat;
      sheet.G2.z = dateFormat;
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Annonser");
      const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const parsed = await parseImportFile(new File([bytes], "datoer.xlsx"));

      expect(parsed.errors).toEqual([]);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].attributes).toEqual({
        next_eu_control: "2027-05-31",
        first_registration_date: "2018-03-08",
      });
      expect(parsed.rows[0].priceNok).toBe(4500);
      const category = { id: "sykler", parent_id: null, slug: "sykler", name_nb: "Sykler" };
      const context: SyncContext = {
        organizationId: "org-1",
        userId: "user-1",
        locationId: "loc-1",
        source: "api",
        location: { postal_code: "0150", city: "Oslo", lat: 59.91, lng: 10.75, address_line: null },
        categoryAccess: "all",
        allowedCategoryIds: new Set(),
        categories: [category],
        categoriesById: new Map([[category.id, category]]),
        filters: [],
        flows: [],
      };
      expect(validateSyncRow(parsed.rows[0], context)).toMatchObject({ ok: true });
    },
  );

  it.each(["csv", "xlsx"])(
    "normaliserer Excel-serienummer fra %s gjennom servervalidering (ekvivalensklasser)",
    async (extension) => {
      const headers = [...baseHeader.split(";"), "attr:next_eu_control", "condition", "can_ship"];
      const row = [...validRow.split(";"), 46538, "good", "true"];
      let input = file("datoer.csv", `${headers.join(";")}\n${row.join(";")}`);
      if (extension === "xlsx") {
        const XLSX = await import("@e965/xlsx");
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, row]), "Annonser");
        input = new File(
          [XLSX.write(workbook, { type: "array", bookType: "xlsx" })],
          "datoer.xlsx",
        );
      }
      const parsed = await parseImportFile(input, { next_eu_control: { type: "date" } });
      expect(parsed.errors).toEqual([]);
      expect(parsed.rows).toHaveLength(1);
      const category = { id: "sykler", parent_id: null, slug: "sykler", name_nb: "Sykler" };
      const context: SyncContext = {
        organizationId: "org-1",
        userId: "user-1",
        locationId: "loc-1",
        source: "api",
        location: { postal_code: "0150", city: "Oslo", lat: 59.91, lng: 10.75, address_line: null },
        categoryAccess: "all",
        allowedCategoryIds: new Set(),
        categories: [category],
        categoriesById: new Map([[category.id, category]]),
        filters: [
          normalizeFilter({
            id: "f-date",
            category_id: category.id,
            key: "next_eu_control",
            label_nb: "Neste EU-kontroll",
            type: "date",
            unit: null,
            options: null,
            sort_order: 0,
            is_primary: false,
          }),
        ],
        flows: [],
      };
      expect(validateSyncRow(parsed.rows[0], context)).toMatchObject({
        ok: true,
        row: { attributes: { next_eu_control: "2027-05-31" } },
      });
    },
  );

  // KG-09-F02: SheetJS sin sheetRows kuttet rad 501 bort uten feil.
  it("avviser 501 XLSX-annonser i stedet for å avkorte dem stille", async () => {
    const XLSX = await import("@e965/xlsx");
    const header = ["external_id", "category", "title", "description", "price"];
    const rows = Array.from({ length: 501 }, (_, i) => [
      `sku-${i}`,
      "sykler",
      "En sykkel",
      "Dette er en god beskrivelse av varen.",
      "4500",
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Ledetekst"], header, [], ...rows]),
      "Annonser",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    await expect(parseImportFile(new File([bytes], "annonser.xlsx"))).rejects.toThrow(
      /maksimalt 500/,
    );
  });

  it("leser alle 500 XLSX-annonser selv med mange tomme rader imellom", async () => {
    const XLSX = await import("@e965/xlsx");
    const header = ["external_id", "category", "title", "description", "price"];
    const rows = Array.from({ length: 500 }, (_, i) => [
      [`sku-${i}`, "sykler", "En sykkel", "Dette er en god beskrivelse av varen.", "4500"],
      [],
    ]).flat();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ...rows]), "Annonser");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const parsed = await parseImportFile(new File([bytes], "annonser.xlsx"));
    expect(parsed.rows).toHaveLength(500);
  });

  it("avviser data utenfor den fysiske radgrensen i stedet for å kutte den", async () => {
    const XLSX = await import("@e965/xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      ["external_id", "category", "title", "description", "price"],
    ]);
    XLSX.utils.sheet_add_aoa(
      sheet,
      [["sku-sent", "sykler", "En sykkel", "Dette er en god beskrivelse av varen.", "4500"]],
      { origin: "A6000" },
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Annonser");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    await expect(parseImportFile(new File([bytes], "annonser.xlsx"))).rejects.toThrow(
      /Fjern tomme rader/,
    );
  });

  it("avviser fil- og radgrenser før oppretting", async () => {
    const tooLarge = new File([new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)], "annonser.csv");
    await expect(parseImportFile(tooLarge)).rejects.toThrow("5 MB");
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, index) => `id-${index};sykler;En sykkel;Dette er en god beskrivelse av varen.;4500`,
    ).join("\n");
    await expect(parseImportFile(file("annonser.csv", `${baseHeader}\n${rows}`))).rejects.toThrow(
      "500 annonser",
    );
  });

  it("tar med alle underkategoriene når malen bygges for en hovedkategori", async () => {
    const { generateBulkImportXlsxTemplate } = await import("./template");
    const filter = (id: string, categoryId: string, key: string, label: string) => ({
      id,
      category_id: categoryId,
      key,
      label_nb: label,
      type: "text" as const,
      unit: null,
      options: null,
      sort_order: 1,
      is_primary: false,
      depends_on_key: null,
      depends_on_value: null,
      depends_on_not_value: null,
      is_optional: false,
    });
    const bytes = generateBulkImportXlsxTemplate({
      categories: [
        { id: "root", name_nb: "Sport", slug: "sport", parent_id: null },
        { id: "child-1", name_nb: "Sykler", slug: "sykler", parent_id: "root" },
        { id: "child-2", name_nb: "Ski", slug: "ski", parent_id: "root" },
        { id: "other", name_nb: "Møbler", slug: "mobler", parent_id: null },
      ],
      filters: [
        filter("f1", "child-1", "frame_size", "Rammestørrelse"),
        filter("f2", "child-2", "ski_length", "Skilengde"),
      ],
      categoryId: "root",
    });
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.read(bytes, { type: "array" });
    const keys = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["Annonser"], {
      header: 1,
      defval: "",
      raw: false,
    })[1];
    expect(keys).toContain("attr:frame_size");
    expect(keys).toContain("attr:ski_length");
    // Kategoriarket viser bare treet under valget, ikke hele katalogen.
    const listed = XLSX.utils
      .sheet_to_json<string[]>(workbook.Sheets["Kategorier"], { header: 1, defval: "", raw: false })
      .slice(1)
      .map((row) => row[1]);
    expect(listed).toEqual(["sykler", "ski"]);
  });

  it("bygger Excel-malen med forside, nedtrekkslister og kategorikolonner", async () => {
    const { generateBulkImportXlsxTemplate } = await import("./template");
    const bytes = generateBulkImportXlsxTemplate({
      categories: [{ id: "category-1", name_nb: "Sykler", slug: "sykler", parent_id: null }],
      filters: [
        {
          id: "filter-1",
          category_id: "category-1",
          key: "frame_size",
          label_nb: "Rammestørrelse",
          type: "select",
          unit: null,
          options: [{ value: "m", label_nb: "Medium" }],
          sort_order: 1,
          is_primary: true,
          depends_on_key: null,
          depends_on_value: null,
          depends_on_not_value: null,
          is_optional: false,
        },
      ],
      categoryId: "category-1",
    });
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames).toEqual([
      "Start",
      "Annonser",
      "Kategorifelter",
      "Kategorier",
      "Lister",
    ]);
    const listing = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["Annonser"], {
      header: 1,
      defval: "",
      raw: false,
    });
    expect(listing[0][0]).toBe("Ekstern ID *");
    expect(listing[1]).toContain("external_id");
    expect(listing[1]).toContain("attr:frame_size");
    // Tom mal skal kunne leses uten at eksempeldata smugles inn i importen.
    const parsed = await parseImportFile(new File([bytes], "mal.xlsx"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([]);
  });

  it("leser attr-kolonner, norske tilstandsetiketter og ledetekstraden over kolonnenavnene", async () => {
    const csv = [
      "Ekstern ID;Kategori;Tittel;Beskrivelse;Pris;Tilstand;Rammestørrelse",
      "external_id;category;title;description;price;condition;attr:frame_size",
      "sku-1;sykler;En fin sykkel;Dette er en god beskrivelse av varen.;4500;Som ny;Medium",
    ].join("\n");
    const parsed = await parseImportFile(file("annonser.csv", csv), {
      frame_size: { type: "select", options: { medium: "m" } },
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.condition).toBe("like_new");
    expect(parsed.rows[0]?.attributes).toEqual({ frame_size: "m" });
    expect(parsed.rows[0]?.rowNumber).toBe(3);
  });

  it("leser norske tall og avviser punktum som tvetydig tusenskille", async () => {
    const header = `${baseHeader};attr:mileage_km`;
    const parsed = await parseImportFile(
      file(
        "annonser.csv",
        `${header}\n${validRow};150 000\nid-2;sykler;En sykkel;Dette er en god beskrivelse av varen.;4500;150.000\n`,
      ),
      { mileage_km: { type: "number" } },
    );
    expect(parsed.rows.map((row) => row.attributes)).toEqual([{ mileage_km: 150000 }]);
    expect(parsed.errors).toEqual([
      expect.objectContaining({ rowNumber: 3, field: "attr:mileage_km" }),
    ]);
  });

  it("avviser stedskolonner fra den gamle malen med en forklarende feil", async () => {
    const csv = [
      "external_id;category;title;description;price;postal_code",
      "sku-1;sykler;En fin sykkel;Dette er en god beskrivelse av varen.;4500;0150",
    ].join("\n");
    await expect(parseImportFile(file("annonser.csv", csv))).rejects.toThrow("bedriftsadressen");
  });

  it("gir norsk feil for skadet fil", async () => {
    await expect(
      parseImportFile(file("annonser.csv", `${baseHeader}\n"uavsluttet`)),
    ).rejects.toBeInstanceOf(ImportFileError);
  });

  it("leser status- og images-kolonnene, inkludert norske statusetiketter", async () => {
    // Kolonnen images kan selv inneholde semikolon (flere URL-er) i en fil
    // som ellers bruker semikolon som CSV-skilletegn — cellen må derfor
    // være sitert, akkurat som en flerverdi-attributtkolonne.
    const csv = [
      `${baseHeader};status;images`,
      'id-1;sykler;En fin sykkel;Dette er en god beskrivelse av varen.;4500;Solgt;"https://example.com/a.jpg;https://example.com/b.jpg"',
    ].join("\n");
    const parsed = await parseImportFile(file("annonser.csv", csv));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.status).toBe("sold");
    expect(parsed.rows[0]?.imageUrls).toEqual([
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ]);
  });

  it("gir tom status og imageUrls som tom liste når kolonnene ikke fylles ut", async () => {
    const csv = [`${baseHeader};status;images`, `${validRow};;`].join("\n");
    const parsed = await parseImportFile(file("annonser.csv", csv));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.status).toBeUndefined();
    expect(parsed.rows[0]?.imageUrls).toEqual([]);
  });

  it("avviser en ukjent statusverdi med en norsk feilmelding", async () => {
    const csv = [`${baseHeader};status`, `${validRow};ukjent`].join("\n");
    const parsed = await parseImportFile(file("annonser.csv", csv));
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([
      { rowNumber: 2, field: "status", message: expect.stringContaining("Ukjent status") },
    ]);
  });

  it("avviser http:// bilde-URL-er", async () => {
    const csv = [`${baseHeader};images`, `${validRow};http://example.com/a.jpg`].join("\n");
    const parsed = await parseImportFile(file("annonser.csv", csv));
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([
      {
        rowNumber: 2,
        field: "imageUrls",
        message: "Bilde-URL må starte med https://.",
      },
    ]);
  });

  it("godtar 100 bilde-URL-er per rad (øvre grense)", async () => {
    const urls = Array.from({ length: 100 }, (_, index) => `https://example.com/${index}.jpg`);
    const csv = [`${baseHeader};images`, `${validRow};"${urls.join(";")}"`].join("\n");
    const parsed = await parseImportFile(file("annonser.csv", csv));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].imageUrls).toEqual(urls);
  });

  it("avviser mer enn 100 bilde-URL-er per rad", async () => {
    const urls = Array.from({ length: 101 }, (_, index) => `https://example.com/${index}.jpg`).join(
      ";",
    );
    const csv = [`${baseHeader};images`, `${validRow};"${urls}"`].join("\n");
    const parsed = await parseImportFile(file("annonser.csv", csv));
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([
      {
        rowNumber: 2,
        field: "imageUrls",
        message: "Maks 100 bilder per annonse.",
      },
    ]);
  });
});
