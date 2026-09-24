import { beforeEach, describe, expect, it, vi } from "vitest";

const listCategoriesApi = vi.fn();
const getCategoryFieldsApi = vi.fn();
const listLocationsApi = vi.fn();
const listListingsApi = vi.fn();
const getListingApi = vi.fn();
const upsertListingApi = vi.fn();
const setListingStatusApi = vi.fn();
const renewListingsApi = vi.fn();
const replaceListingImagesApi = vi.fn();

vi.mock("@/features/listing-api/listing-api.server", () => ({
  listCategoriesApi: (...args: unknown[]) => listCategoriesApi(...args),
  getCategoryFieldsApi: (...args: unknown[]) => getCategoryFieldsApi(...args),
  listLocationsApi: (...args: unknown[]) => listLocationsApi(...args),
  listListingsApi: (...args: unknown[]) => listListingsApi(...args),
  getListingApi: (...args: unknown[]) => getListingApi(...args),
  upsertListingApi: (...args: unknown[]) => upsertListingApi(...args),
  setListingStatusApi: (...args: unknown[]) => setListingStatusApi(...args),
  renewListingsApi: (...args: unknown[]) => renewListingsApi(...args),
  replaceListingImagesApi: (...args: unknown[]) => replaceListingImagesApi(...args),
}));

function auth() {
  return {
    keyId: "key-1",
    organizationId: "org-1",
    actingUserId: "user-1",
    defaultLocationId: "loc-1",
    scopes: ["listings:read", "listings:write"] as ("listings:read" | "listings:write")[],
  };
}

const notFound = {
  isApiBusinessError: true,
  status: 404,
  code: "not_found",
  message: "Fant ingen annonse.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MCP_TOOLS", () => {
  it("inneholder alle 10 verktøyene med gyldig navn/beskrivelse/inputSchema", async () => {
    const { MCP_TOOLS } = await import("./mcp-tools");
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).toEqual([
      "list_categories",
      "get_category_fields",
      "list_locations",
      "list_listings",
      "get_listing",
      "validate_listing",
      "upsert_listing",
      "set_listing_status",
      "renew_listings",
      "add_listing_images",
    ]);
    for (const tool of MCP_TOOLS) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(["listings:read", "listings:write"]).toContain(tool.scope);
      expect(["read", "write", "batch"]).toContain(tool.rateLimitKind);
    }
  });

  it("validate_listing krever listings:write men telles som read", async () => {
    const { findMcpTool } = await import("./mcp-tools");
    const tool = findMcpTool("validate_listing")!;
    expect(tool.scope).toBe("listings:write");
    expect(tool.rateLimitKind).toBe("read");
  });

  it("upsert_listing/set_listing_status/renew_listings/add_listing_images er write-scope", async () => {
    const { findMcpTool } = await import("./mcp-tools");
    for (const name of [
      "upsert_listing",
      "set_listing_status",
      "renew_listings",
      "add_listing_images",
    ]) {
      expect(findMcpTool(name)!.scope).toBe("listings:write");
    }
  });
});

describe("upsert_listing — utkast-default", () => {
  it("en NY annonse opprettes som draft når publish ikke er satt", async () => {
    getListingApi.mockRejectedValue(notFound);
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "created",
      externalRef: "SKU-1",
      listingId: "l1",
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("upsert_listing")!.execute(auth(), {
      externalRef: "SKU-1",
      category: "sykler",
      title: "En fin sykkel",
      description: "En beskrivelse på minst tjue tegn.",
      price: 1000,
    });
    expect(upsertListingApi).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRef: "SKU-1",
        dryRun: false,
        allowDraftStatus: true,
        body: expect.objectContaining({ status: "draft" }),
      }),
    );
    expect(result.text).toMatch(/UTKAST/);
    expect(result.text).toMatch(/set_listing_status/);
  });

  it("publish: true gir en aktiv (publisert) annonse", async () => {
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "created",
      externalRef: "SKU-2",
      listingId: "l2",
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("upsert_listing")!.execute(auth(), {
      externalRef: "SKU-2",
      category: "sykler",
      title: "En fin sykkel",
      description: "En beskrivelse på minst tjue tegn.",
      price: 1000,
      publish: true,
    });
    // publish:true skal ikke trenge å sjekke om annonsen finnes fra før.
    expect(getListingApi).not.toHaveBeenCalled();
    expect(upsertListingApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ status: "active" }) }),
    );
    expect(result.text).toMatch(/publisert/);
  });

  it("en EKSISTERENDE annonse beholder status uendret når status ikke er gitt eksplisitt", async () => {
    getListingApi.mockResolvedValue({ externalRef: "SKU-3", status: "sold" });
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "updated",
      externalRef: "SKU-3",
      listingId: "l3",
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("upsert_listing")!.execute(auth(), {
      externalRef: "SKU-3",
      category: "sykler",
      title: "En fin sykkel",
      description: "En beskrivelse på minst tjue tegn.",
      price: 1000,
    });
    expect(upsertListingApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.not.objectContaining({ status: expect.anything() }) }),
    );
    expect(result.text).toMatch(/ikke endret/);
  });

  it("eksplisitt status vinner alltid, uansett publish/eksistens", async () => {
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "updated",
      externalRef: "SKU-4",
      listingId: "l4",
    });
    const { findMcpTool } = await import("./mcp-tools");
    await findMcpTool("upsert_listing")!.execute(auth(), {
      externalRef: "SKU-4",
      category: "sykler",
      title: "En fin sykkel",
      description: "En beskrivelse på minst tjue tegn.",
      price: 1000,
      status: "archived",
    });
    expect(getListingApi).not.toHaveBeenCalled();
    expect(upsertListingApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ status: "archived" }) }),
    );
  });

  it("forretningsfeil fra tjenestelaget kastes videre (fanges av mcp.ts som isError)", async () => {
    getListingApi.mockRejectedValue(notFound);
    upsertListingApi.mockRejectedValue({
      isApiBusinessError: true,
      status: 422,
      code: "validation_error",
      message: "Tittelen må ha minst 5 tegn.",
      field: "title",
    });
    const { findMcpTool } = await import("./mcp-tools");
    await expect(
      findMcpTool("upsert_listing")!.execute(auth(), {
        externalRef: "SKU-5",
        category: "sykler",
        title: "x",
        description: "En beskrivelse på minst tjue tegn.",
        price: 1000,
      }),
    ).rejects.toMatchObject({ code: "validation_error", field: "title" });
  });
});

describe("validate_listing", () => {
  it("kaller upsertListingApi med dryRun: true og allowDraftStatus: true", async () => {
    upsertListingApi.mockResolvedValue({
      importId: "imp-1",
      status: "created",
      externalRef: "SKU-6",
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("validate_listing")!.execute(auth(), {
      externalRef: "SKU-6",
      category: "sykler",
      title: "En fin sykkel",
      description: "En beskrivelse på minst tjue tegn.",
      price: 1000,
    });
    expect(upsertListingApi).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, allowDraftStatus: true }),
    );
    expect(result.text).toMatch(/dryRun/);
  });
});

describe("andre verktøy — tynne wrappere", () => {
  it("list_categories oppsummerer antall", async () => {
    listCategoriesApi.mockResolvedValue([{ id: "1" }, { id: "2" }]);
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("list_categories")!.execute(auth(), {});
    expect(result.text).toContain("2");
    expect(result.structured).toEqual({ items: [{ id: "1" }, { id: "2" }] });
  });

  it("get_listing videresender externalRef og oppsummerer status", async () => {
    getListingApi.mockResolvedValue({
      externalRef: "SKU-7",
      status: "active",
      title: "Tittel",
      publicUrl: "https://kaupet.no/ABC123",
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("get_listing")!.execute(auth(), { externalRef: "SKU-7" });
    expect(getListingApi).toHaveBeenCalledWith({ auth: auth(), externalRef: "SKU-7" });
    expect(result.text).toContain("active");
  });

  it("set_listing_status videresender status og oppsummerer resultatet", async () => {
    setListingStatusApi.mockResolvedValue({
      externalRef: "SKU-8",
      listingId: "l8",
      status: "sold",
      changed: true,
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("set_listing_status")!.execute(auth(), {
      externalRef: "SKU-8",
      status: "sold",
    });
    expect(setListingStatusApi).toHaveBeenCalledWith({
      auth: auth(),
      externalRef: "SKU-8",
      body: { status: "sold" },
    });
    expect(result.text).toContain("sold");
  });

  it("renew_listings oppsummerer tellerne", async () => {
    renewListingsApi.mockResolvedValue({
      importId: "imp-1",
      renewed: 3,
      reactivated: 1,
      skipped: 0,
      notFound: ["ukjent"],
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("renew_listings")!.execute(auth(), {
      externalRefs: ["a", "b", "c", "ukjent"],
    });
    expect(result.text).toContain("Fornyet 3");
    expect(result.text).toContain("ukjent");
  });

  it("add_listing_images erstatter bildesettet og nevner asynkron behandling", async () => {
    replaceListingImagesApi.mockResolvedValue({
      externalRef: "SKU-9",
      images: [{ sourceUrl: "https://x/a.jpg", status: "pending", url: null }],
    });
    const { findMcpTool } = await import("./mcp-tools");
    const result = await findMcpTool("add_listing_images")!.execute(auth(), {
      externalRef: "SKU-9",
      urls: ["https://x/a.jpg"],
    });
    expect(replaceListingImagesApi).toHaveBeenCalledWith({
      auth: auth(),
      externalRef: "SKU-9",
      body: { urls: ["https://x/a.jpg"] },
    });
    expect(result.text).toMatch(/asynkront/);
  });
});
