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
  actorFromApiKey.mockReset().mockResolvedValue({ organizationId: "org-1", userId: "user-1" });
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

const apiAuth = {
  keyId: "key-1",
  organizationId: "org-1",
  actingUserId: "user-1",
  defaultLocationId: "location-1",
  scopes: ["listings:write" as const],
};

function mockListing(listing: Record<string, unknown>) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "listing-1",
      organization_location_id: "location-b",
      seller_id: "other-user",
      status: "active",
      category_id: "category-1",
      ...listing,
    },
    error: null,
  });
  supabaseAdmin.from.mockReturnValue(query);
}

function mockRpc(canUpdate: boolean, enqueue: { data: unknown; error: unknown }) {
  supabaseAdmin.rpc.mockImplementation(async (name: string) =>
    name === "can_update_organization_listing" ? { data: canUpdate, error: null } : enqueue,
  );
}

describe("replaceListingImagesApi quota errors", () => {
  it("maps only the stable database quota error to the public validation response", async () => {
    mockListing({});
    mockRpc(true, {
      data: null,
      error: { message: "organization_new_images_daily_quota_exceeded" },
    });

    await expect(
      replaceListingImagesApi({
        auth: apiAuth,
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

// KG-08-F03: bare nøkkelens standardlokasjon ble kontrollert, så en nøkkel med
// write-scope kunne erstatte bildesettet på annonser ved andre lokasjoner.
describe("replaceListingImagesApi tilgang", () => {
  it("avviser og lar bildene stå når aktøren mangler endringsrett til annonsen", async () => {
    mockListing({});
    mockRpc(false, { data: 1, error: null });

    await expect(
      replaceListingImagesApi({
        auth: apiAuth,
        externalRef: "sku-b",
        body: { urls: ["https://example.com/a.jpg"] },
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("can_update_organization_listing", {
      _organization_id: "org-1",
      _location_id: "location-b",
      _seller_id: "other-user",
      _status: "active",
      _category_id: "category-1",
      _user_id: "user-1",
    });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith(
      "enqueue_listing_image_jobs",
      expect.anything(),
    );
  });

  it("sender aktøren til køen og avviser når RPC-en nekter (endret tilgang etter sjekken)", async () => {
    mockListing({});
    mockRpc(true, { data: null, error: { code: "42501", message: "listing_update_forbidden" } });

    await expect(
      replaceListingImagesApi({
        auth: apiAuth,
        externalRef: "sku-b",
        body: { urls: ["https://example.com/a.jpg"] },
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "enqueue_listing_image_jobs",
      expect.objectContaining({ _user_id: "user-1" }),
    );
  });

  it("avviser manglende RPC uten å prøve igjen uten aktør", async () => {
    mockListing({});
    supabaseAdmin.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "can_update_organization_listing") return { data: true, error: null };
      return "_user_id" in args
        ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
        : { data: 1, error: null };
    });

    await expect(
      replaceListingImagesApi({
        auth: apiAuth,
        externalRef: "sku-b",
        body: { urls: ["https://example.com/a.jpg"] },
      }),
    ).rejects.toMatchObject({ code: "PGRST202" });
    const enqueueCalls = supabaseAdmin.rpc.mock.calls.filter(
      ([name]) => name === "enqueue_listing_image_jobs",
    );
    expect(enqueueCalls.map(([, args]) => "_user_id" in args)).toEqual([true]);
  });

  it("avviser deaktiverte annonser selv med endringsrett", async () => {
    mockListing({ status: "disabled" });
    mockRpc(true, { data: 1, error: null });

    await expect(
      replaceListingImagesApi({
        auth: apiAuth,
        externalRef: "sku-b",
        body: { urls: ["https://example.com/a.jpg"] },
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith(
      "enqueue_listing_image_jobs",
      expect.anything(),
    );
  });
});
