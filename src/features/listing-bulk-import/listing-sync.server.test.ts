import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  newImagesPerDayLimitMessage,
  newListingsPerDayLimitMessage,
} from "@/lib/integration-limits";
import { normalizeFilter } from "@/lib/category-filters";
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

/** Bygger en `supabaseAdmin`-dobbel for ref- og kaupet_code-oppslag. */
function makeSupabaseAdmin({
  existingRefs = [] as string[],
  rpcImpl,
}: {
  existingRefs?: string[];
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

  it("normaliserer norske datoer til ISO og avviser datoer som ikke kan tolkes", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "created" }, error: null };
      },
    });
    const dateFilter = normalizeFilter({
      id: "f-eu",
      category_id: categoryId,
      key: "next_eu_control",
      label_nb: "Neste EU-kontroll",
      type: "date",
      unit: null,
      options: null,
      sort_order: 0,
      is_primary: false,
      is_optional: true,
    });
    const results = await syncListings(
      supabaseAdmin,
      { ...makeContext(), filters: [dateFilter] },
      {
        importId,
        rows: [
          makeRow({
            rowNumber: 2,
            externalId: "ok",
            attributes: { next_eu_control: "31.12.2027" },
          }),
          makeRow({ rowNumber: 3, externalId: "feil", attributes: { next_eu_control: "snart" } }),
        ],
        mode: "create",
      },
    );
    expect(results[0]).toMatchObject({ status: "created" });
    expect(JSON.stringify(rpc.mock.calls[0][0])).toContain('"next_eu_control":"2027-12-31"');
    expect(results[1]).toMatchObject({
      status: "failed",
      error: "Neste EU-kontroll må være en dato, f.eks. 2027-05-31.",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("dry_run sender _dry_run: true og skriver ikke kvote", async () => {
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
    expect(supabaseAdmin.from).not.toHaveBeenCalledWith("organization_daily_quotas");
  });

  it("viser stabil databasekvotefeil med kundemeldingen", async () => {
    const rpc = vi.fn((_args: unknown) => undefined);
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (_name, args) => {
        rpc(args);
        return {
          data: { status: "failed", error_code: "daily_listing_quota" },
          error: null,
        };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ rowNumber: 2, externalId: "ref-n" })],
      mode: "create",
    });
    expect(results[0]).toMatchObject({ status: "failed", error: newListingsPerDayLimitMessage() });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("oppdateringer av eksisterende referanser påvirkes ikke av dagens grense", async () => {
    const rpc = vi.fn((_args: unknown) => undefined);
    const supabaseAdmin = makeSupabaseAdmin({
      existingRefs: ["existing-ref"],
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

  it("sender opprettelsesstatus separat fra eksplisitt status i MCP-modus", async () => {
    const rpc = vi.fn();
    const supabaseAdmin = makeSupabaseAdmin({
      existingRefs: ["existing-ref"],
      rpcImpl: (_name, args) => {
        rpc(args);
        return { data: { status: "unchanged", listing_id: "listing-1" }, error: null };
      },
    });
    await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "existing-ref" })],
      mode: "upsert",
      createStatus: "draft",
    });
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        _mode: "mcp",
        _listing: expect.objectContaining({ status: "", create_status: "draft" }),
      }),
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

  it("legger bilder i kø (enqueue_listing_image_jobs, _replace=true) når raden har imageUrls", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (name, args) => {
        calls.push({ name, args });
        if (name === "upsert_listing_from_external") {
          return { data: { status: "created", listing_id: "listing-1" }, error: null };
        }
        return { data: 2, error: null };
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
    expect(results[0].warning).toBeUndefined();
    const enqueueCall = calls.find((c) => c.name === "enqueue_listing_image_jobs");
    expect(enqueueCall?.args).toEqual({
      _organization_id: "org-1",
      _listing_id: "listing-1",
      _urls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
      _replace: true,
      // KG-08-F03: aktøren kontrolleres i køgrensen, ikke bare ved upsert.
      _user_id: makeContext().userId,
    });
  });

  // KG-09-F01: «kun nye» med kjent referanse erstattet bildesettet til en
  // annonse aktøren ikke nødvendigvis har endringsrett til.
  it("legger IKKE bilder i kø for duplikat i create-modus", async () => {
    const calls: string[] = [];
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (name) => {
        calls.push(name);
        return { data: { status: "duplicate", listing_id: "listing-b" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "known-ref", imageUrls: ["https://example.com/new.jpg"] })],
      mode: "create",
    });
    expect(results[0]).toMatchObject({ status: "duplicate" });
    expect(calls).toEqual(["upsert_listing_from_external"]);
  });

  it("legger IKKE bilder i kø når raden ikke sender imageUrls (kolonne mangler/tom rører ikke bildene)", async () => {
    const calls: string[] = [];
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (name) => {
        calls.push(name);
        return { data: { status: "created", listing_id: "listing-1" }, error: null };
      },
    });
    await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "no-images", imageUrls: [] })],
      mode: "create",
    });
    expect(calls).toEqual(["upsert_listing_from_external"]);
  });

  it("legger ikke bilder i kø i dry-run", async () => {
    const calls: string[] = [];
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (name) => {
        calls.push(name);
        return { data: { status: "created" }, error: null };
      },
    });
    await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [makeRow({ externalId: "with-images", imageUrls: ["https://example.com/a.jpg"] })],
      mode: "create",
      dryRun: true,
    });
    expect(calls).toEqual(["upsert_listing_from_external"]);
    expect(supabaseAdmin.from).not.toHaveBeenCalledWith("listing_image_jobs");
  });

  it("viser stabil databasekvotefeil for bilder som advarsel", async () => {
    const calls: string[] = [];
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: (name) => {
        calls.push(name);
        if (name === "enqueue_listing_image_jobs") {
          return { data: null, error: new Error("organization_new_images_daily_quota_exceeded") };
        }
        return { data: { status: "created", listing_id: "listing-1" }, error: null };
      },
    });
    const results = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [
        makeRow({
          externalId: "with-images",
          imageUrls: ["https://example.com/a.jpg"],
        }),
      ],
      mode: "create",
    });
    expect(results[0]).toMatchObject({ status: "created", warning: newImagesPerDayLimitMessage() });
    expect(calls).toEqual(["upsert_listing_from_external", "enqueue_listing_image_jobs"]);
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

// KG-08-F01: MCP-standarden «nytt utkast» ble avvist av den delte synkvalideringen.
describe("syncListings — utkast via MCP", () => {
  const draftRow = () => makeRow({ status: "draft" as BulkImportRow["status"] });

  it("oppretter ny annonse som utkast når allowDraftStatus er satt", async () => {
    const supabaseAdmin = makeSupabaseAdmin({
      rpcImpl: () => ({ data: { status: "created", listing_id: "listing-1" }, error: null }),
    });
    const [result] = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [draftRow()],
      mode: "upsert",
      allowDraftStatus: true,
    });
    expect(result.status).toBe("created");
    const rpcArgs = (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(rpcArgs._listing.status).toBe("draft");
  });

  it("avviser fortsatt utkast for REST/Excel og for eksisterende referanser", async () => {
    const supabaseAdmin = makeSupabaseAdmin({
      existingRefs: ["external-1"],
      rpcImpl: () => ({ data: { status: "updated", listing_id: "listing-1" }, error: null }),
    });
    const [rest] = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [draftRow()],
      mode: "upsert",
    });
    const [existing] = await syncListings(supabaseAdmin, makeContext(), {
      importId,
      rows: [draftRow()],
      mode: "upsert",
      allowDraftStatus: true,
    });
    expect(rest.status).toBe("failed");
    expect(existing.status).toBe("failed");
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});

it.each(["40", "oops"])("synk validerer og normaliserer tallfeltet %j før RPC", async (width) => {
  const ctx = makeContext();
  ctx.filters = [
    {
      id: "f1",
      category_id: categoryId,
      key: "width_cm",
      label_nb: "Bredde",
      type: "number",
      sort_order: 0,
    } as SyncContext["filters"][number],
  ];
  const admin = makeSupabaseAdmin({
    rpcImpl: (_name, args) => {
      expect(args._listing).toMatchObject({ attributes: { width_cm: 40, brand: "2020" } });
      return { data: { status: "created", listing_id: "listing-1" }, error: null };
    },
  });
  const result = await syncListings(admin, ctx, {
    importId,
    mode: "create",
    rows: [makeRow({ attributes: { width_cm: width, brand: "2020" } })],
  });
  expect(result[0].status).toBe(width === "40" ? "created" : "failed");
});
