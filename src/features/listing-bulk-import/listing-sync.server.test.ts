import { beforeEach, describe, expect, it, vi } from "vitest";

import { INTEGRATION_LIMITS, newListingsPerDayLimitMessage } from "@/lib/integration-limits";
import type { BulkImportRow } from "./import-schema";
import { syncListings, type SyncContext } from "./listing-sync.server";

const categoryId = "22222222-2222-4222-8222-222222222222";
const importId = "11111111-1111-4111-8111-111111111111";

function makeRow(overrides: Partial<BulkImportRow> = {}): BulkImportRow {
  return {
    rowNumber: 2,
    externalId: "external-1",
    category: "sykler",
    title: "En sykkel",
    description: "Dette er en god beskrivelse av varen.",
    priceNok: 4500,
    condition: "good",
    canShip: true,
    imageUrls: [],
    attributes: {},
    ...overrides,
  };
}

function makeContext(): SyncContext {
  return {
    organizationId: "org-1",
    userId: "user-1",
    locationId: "loc-1",
    showVisitingAddress: false,
    source: "api",
    location: { postal_code: "0150", city: "Oslo", lat: 59.91, lng: 10.75, address_line: null },
    categoryAccess: "all",
    allowedCategoryIds: new Set(),
    categories: [{ id: categoryId, parent_id: null, slug: "sykler", name_nb: "Sykler" }],
    categoriesById: new Map([
      [categoryId, { id: categoryId, parent_id: null, slug: "sykler", name_nb: "Sykler" }],
    ]),
    filters: [],
    flows: [],
  };
}

/** Bygger en `supabaseAdmin`-dobbel som dekker akkurat spørringene
 * `syncListings` gjør: forhåndsoppslag av eksisterende `external_ref`-er,
 * dagens opptelling av nye annonser, og kaupet_code-oppslag per batch. */
function makeSupabaseAdmin({
  existingRefs = [] as string[],
  createdToday = 0,
  rpcImpl,
}: {
  existingRefs?: string[];
  createdToday?: number;
  rpcImpl: (name: string, args: Record<string, unknown>) => unknown;
}) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = { _select: undefined as unknown };
    for (const method of ["eq", "in", "gte"]) chain[method] = vi.fn(() => chain);
    chain.select = vi.fn((arg: unknown) => {
      chain._select = arg;
      return chain;
    });
    chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(
        table === "listings" && chain._select === "external_ref"
          ? { data: existingRefs.map((external_ref) => ({ external_ref })), error: null }
          : table === "listings"
            ? {
                data: [{ id: "listing-1", kaupet_code: "12345678" }],
                error: null,
              }
            : table === "organization_listing_imports"
              ? { data: null, count: createdToday, error: null }
              : { data: null, error: null },
      ).then(resolve, reject);
    return chain;
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => rpcImpl(name, args));
  return { from, rpc } as unknown as Parameters<typeof syncListings>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncListings", () => {
  it("mapper created/updated/unchanged/duplicate fra RPC-svaret", async () => {
    const supabaseAdmin = makeSupabaseAdmin({
      existingRefs: ["updated-ref", "unchanged-ref", "duplicate-ref"],
      rpcImpl: (name, args) => {
        expect(name).toBe("upsert_listing_from_external");
        const ref = args._external_ref as string;
        const status =
          ref === "created-ref"
            ? "created"
            : ref === "updated-ref"
              ? "updated"
              : ref === "unchanged-ref"
                ? "unchanged"
                : "duplicate";
        return { data: { status, listing_id: "listing-1" }, error: null };
      },
    });
    const rows = [
      makeRow({ rowNumber: 2, externalId: "created-ref" }),
      makeRow({ rowNumber: 3, externalId: "updated-ref" }),
      makeRow({ rowNumber: 4, externalId: "unchanged-ref" }),
      makeRow({ rowNumber: 5, externalId: "duplicate-ref" }),
    ];
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows,
      mode: "upsert",
    });
    expect(results).toEqual([
      {
        rowNumber: 2,
        externalId: "created-ref",
        status: "created",
        listingId: "listing-1",
        kaupetCode: "12345678",
      },
      {
        rowNumber: 3,
        externalId: "updated-ref",
        status: "updated",
        listingId: "listing-1",
        kaupetCode: "12345678",
      },
      {
        rowNumber: 4,
        externalId: "unchanged-ref",
        status: "unchanged",
        listingId: "listing-1",
        kaupetCode: "12345678",
      },
      {
        rowNumber: 5,
        externalId: "duplicate-ref",
        status: "duplicate",
        listingId: "listing-1",
        kaupetCode: "12345678",
      },
    ]);
  });

  it("dry_run sender _dry_run: true og teller ikke mot dagens grense", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "created" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow()],
      mode: "create",
      dryRun: true,
    });
    expect(results[0]).toMatchObject({ status: "created" });
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({ _dry_run: true }));
    // Ingen opptelling av dagens grense skal skje for dry-run.
    expect(supabaseAdmin.from).not.toHaveBeenCalledWith("organization_listing_imports");
  });

  it("håndhever dagens grense for nye annonser uten å ringe RPC-en for raden som overskrider", async () => {
    const rpc = vi.fn((_args: unknown) => undefined);
    const supabaseAdmin = makeSupabaseAdmin({
      createdToday: INTEGRATION_LIMITS.organization.newListingsPerDay - 1,
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "created", listing_id: "listing-1" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [
        makeRow({ rowNumber: 2, externalId: "ref-n" }),
        makeRow({ rowNumber: 3, externalId: "ref-n-plus-1" }),
      ],
      mode: "create",
    });
    expect(results[0]).toMatchObject({ status: "created" });
    expect(results[1]).toMatchObject({ status: "failed", error: newListingsPerDayLimitMessage() });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("oppdateringer av eksisterende referanser påvirkes ikke av dagens grense", async () => {
    const rpc = vi.fn((_args: unknown) => undefined);
    const supabaseAdmin = makeSupabaseAdmin({
      existingRefs: ["existing-ref"],
      createdToday: INTEGRATION_LIMITS.organization.newListingsPerDay,
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "updated", listing_id: "listing-1" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "existing-ref" })],
      mode: "upsert",
    });
    expect(results[0]).toMatchObject({ status: "updated" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returnerer en trygg feilmelding ved valideringsfeil, uten å ringe RPC-en", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "created" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ category: "finnes-ikke" })],
      mode: "create",
    });
    expect(results[0]).toMatchObject({
      status: "failed",
      error: "Raden kunne ikke opprettes. Kontroller feltene og prøv igjen.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sender status videre til RPC-en", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      existingRefs: ["existing-ref"],
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "updated", listing_id: "listing-1" }, error: null };
      },
    });
    await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "existing-ref", status: "sold" })],
      mode: "upsert",
    });
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({ _listing: expect.objectContaining({ status: "sold" }) }),
    );
  });

  it("sender tom status videre når raden ikke har status satt", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      existingRefs: ["existing-ref"],
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "updated", listing_id: "listing-1" }, error: null };
      },
    });
    await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "existing-ref" })],
      mode: "upsert",
    });
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({ _listing: expect.objectContaining({ status: "" }) }),
    );
  });

  it("avviser en ny annonse (ukjent referanse) med status solgt eller arkivert, uten å ringe RPC-en", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "created", listing_id: "listing-1" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [
        makeRow({ rowNumber: 2, externalId: "new-ref-sold", status: "sold" }),
        makeRow({ rowNumber: 3, externalId: "new-ref-archived", status: "archived" }),
      ],
      mode: "upsert",
    });
    expect(results).toEqual([
      {
        rowNumber: 2,
        externalId: "new-ref-sold",
        status: "failed",
        error: "En ny annonse kan ikke opprettes som solgt eller arkivert.",
      },
      {
        rowNumber: 3,
        externalId: "new-ref-archived",
        status: "failed",
        error: "En ny annonse kan ikke opprettes som solgt eller arkivert.",
      },
    ]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("avviser samme (ny annonse + solgt/arkivert) også i dry-run, uten å ringe RPC-en", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "created" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "new-ref", status: "archived" })],
      mode: "create",
      dryRun: true,
    });
    expect(results[0]).toMatchObject({
      status: "failed",
      error: "En ny annonse kan ikke opprettes som solgt eller arkivert.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("tar imot imageUrls uten å feile (steg 4 håndterer selve bildehentingen)", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "created", listing_id: "listing-1" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [
        makeRow({
          externalId: "with-images",
          imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        }),
      ],
      mode: "create",
    });
    expect(results[0]).toMatchObject({ status: "created" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maskerer interne feil (kastet unntak) fra RPC-kallet", async () => {
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: () => {
        throw new Error("connection reset by peer");
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow()],
      mode: "create",
    });
    expect(results[0]).toMatchObject({
      status: "failed",
      error: "Annonsen kunne ikke opprettes. Prøv igjen senere.",
    });
  });
});
