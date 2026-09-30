import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseAdmin, actorFromApiKey } = vi.hoisted(() => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
  actorFromApiKey: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));
vi.mock("@/features/listing-bulk-import/listing-sync.server", () => ({ actorFromApiKey }));

import { ListingApiError, mapApiBodyToRow, replaceListingImagesApi } from "./listing-api.server";

beforeEach(() => {
  supabaseAdmin.from.mockReset();
  supabaseAdmin.rpc.mockReset();
  actorFromApiKey.mockReset().mockResolvedValue({ organizationId: "org-1" });
});

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

describe("replaceListingImagesApi quota errors", () => {
  it("maps only the stable database quota error to the public validation response", async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq"]) query[method] = vi.fn(() => query);
    query.maybeSingle = vi.fn().mockResolvedValue({ data: { id: "listing-1" }, error: null });
    supabaseAdmin.from.mockReturnValue(query);
    supabaseAdmin.rpc.mockResolvedValue({
      data: null,
      error: { message: "organization_new_images_daily_quota_exceeded" },
    });

    await expect(
      replaceListingImagesApi({
        auth: {
          keyId: "key-1",
          organizationId: "org-1",
          actingUserId: "user-1",
          defaultLocationId: "location-1",
          scopes: ["listings:write"],
        },
        externalRef: "sku-1",
        body: { urls: ["https://example.com/a.jpg"] },
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
      field: "images",
      isApiBusinessError: true,
    } satisfies Partial<ListingApiError>);
  });
});
