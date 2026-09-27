import { describe, expect, it } from "vitest";

import { mapApiBodyToRow } from "./listing-api.server";

describe("mapApiBodyToRow", () => {
  it("mapper de engelske JSON-feltnavnene til BulkImportRow", () => {
    const row = mapApiBodyToRow(
      {
        category: "sykler",
        title: "Rød hybridsykkel",
        description: "Lite brukt hybridsykkel med gode bremser.",
        price: 4500,
        subtitle: "Toppstand",
        condition: "good",
        canShip: true,
        knownIssues: "Litt slitt sete",
        noKnownIssues: false,
        maintenanceHistory: "Service i fjor",
        status: "active",
        images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        attributes: { color: "red" },
        locationId: "11111111-1111-1111-1111-111111111111",
      },
      "SKU-1",
      1,
    );

    expect(row).toMatchObject({
      externalId: "SKU-1",
      category: "sykler",
      title: "Rød hybridsykkel",
      description: "Lite brukt hybridsykkel med gode bremser.",
      priceNok: 4500,
      subtitle: "Toppstand",
      condition: "good",
      canShip: true,
      knownIssues: "Litt slitt sete",
      noKnownIssues: false,
      maintenanceHistory: "Service i fjor",
      status: "active",
      imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
      attributes: { color: "red" },
      rowNumber: 1,
    });
  });

  it("gir tomme/udefinerte felt trygt når body mangler dem", () => {
    const row = mapApiBodyToRow(
      { category: "sykler", title: "x", description: "y", price: 100 },
      "SKU-2",
      2,
    );
    expect(row.imageUrls).toEqual([]);
    expect(row.attributes).toEqual({});
    expect(row.subtitle).toBeUndefined();
  });

  it("håndterer en helt ugyldig body (ikke et objekt) uten å kaste", () => {
    const row = mapApiBodyToRow(null, "SKU-3", 1);
    expect(row.externalId).toBe("SKU-3");
    expect(row.category).toBe("");
    expect(Number.isNaN(row.priceNok)).toBe(true);
  });
});
