import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAdmin = {
  from: vi.fn(),
  rpc: vi.fn(),
};
const defaultContext = { userId: "user-1", supabase: supabaseAdmin };

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler:
      ((input: { data: unknown; context: typeof defaultContext }) => unknown) | undefined;
    const fn = (input: { data?: unknown; context?: typeof defaultContext } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data), context: input.context ?? defaultContext });
    };
    Object.assign(fn, {
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      middleware: () => fn,
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

import { createListingsFromImport } from "./listing-bulk-import.functions";

const importId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";

function setup({ membership = true, duplicate = false } = {}) {
  supabaseAdmin.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "in", "update"])
      chain[method] = vi.fn(() => chain);
    chain.single = vi.fn(async () =>
      table === "organizations"
        ? { data: { postal_code: "0150", city: "Oslo", lat: 59.91, lng: 10.75 }, error: null }
        : { data: null, error: null },
    );
    chain.maybeSingle = vi.fn(async () =>
      table === "organization_members"
        ? membership
          ? { data: { organization_id: "org-1", role: "superuser", status: "active" }, error: null }
          : { data: null, error: null }
        : { data: table === "listings" ? { kaupet_code: "12345678" } : null, error: null },
    );
    chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(
        table === "categories"
          ? {
              data: [{ id: categoryId, parent_id: null, slug: "sykler", name_nb: "Sykler" }],
              error: null,
            }
          : table === "category_filters" || table === "category_flows"
            ? { data: [], error: null }
            : { data: null, error: null },
      ).then(resolve, reject);
    return chain;
  });
  let createCalls = 0;
  supabaseAdmin.rpc.mockImplementation(async (name: string) => {
    if (name === "organization_has_proff_access") return { data: true, error: null };
    if (name === "create_listing_from_import_row") {
      createCalls += 1;
      return duplicate || createCalls > 1
        ? { data: { status: "duplicate", listing_id: "listing-1" }, error: null }
        : { data: { status: "created", listing_id: "listing-1" }, error: null };
    }
    return { data: null, error: null };
  });
  return { createCalls: () => createCalls };
}

const validRow = {
  rowNumber: 2,
  externalId: "external-1",
  category: "sykler",
  title: "En sykkel",
  description: "Dette er en god beskrivelse av varen.",
  priceNok: 4500,
  condition: "good",
  canShip: true,
  attributes: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createListingsFromImport", () => {
  it("avviser en bruker uten aktiv organisasjonsmedlemskap", async () => {
    setup({ membership: false });
    await expect(
      createListingsFromImport({ data: { importId, rows: [validRow] } }),
    ).rejects.toThrow("tilgang");
  });

  it("validerer hver rad på serveren og oppretter de gyldige radene", async () => {
    const state = setup();
    const invalidRow = { ...validRow, rowNumber: 3, externalId: "external-2", title: "kort" };
    const result = await createListingsFromImport({
      data: { importId, rows: [validRow, invalidRow] },
    });
    expect(result).toEqual([
      {
        rowNumber: 2,
        externalId: "external-1",
        status: "created",
        listingId: "listing-1",
        kaupetCode: "12345678",
      },
      {
        rowNumber: 3,
        externalId: "external-2",
        status: "failed",
        error: "Tittelen må ha minst 5 tegn.",
      },
    ]);
    expect(state.createCalls()).toBe(1);
  });

  it("returnerer en sikker radfeil for ukjent kategori", async () => {
    const state = setup();
    const result = await createListingsFromImport({
      data: { importId, rows: [{ ...validRow, category: "finnes-ikke" }] },
    });
    expect(result[0]).toMatchObject({
      rowNumber: 2,
      externalId: "external-1",
      error: "Raden kunne ikke opprettes. Kontroller feltene og prøv igjen.",
    });
    expect(state.createCalls()).toBe(0);
  });

  it("bruker bedriftsadressen som lokasjon i stedet for noe fra filen", async () => {
    setup();
    await createListingsFromImport({ data: { importId, rows: [validRow] } });
    const call = supabaseAdmin.rpc.mock.calls.find(
      ([name]) => name === "create_listing_from_import_row",
    );
    expect(call?.[1]._listing).toMatchObject({
      postal_code: "0150",
      city: "Oslo",
      lat: 59.91,
      lng: 10.75,
    });
  });

  it("returnerer duplikat ved ny innsending med samme import-ID", async () => {
    setup({ duplicate: true });
    const result = await createListingsFromImport({ data: { importId, rows: [validRow] } });
    expect(result[0]).toMatchObject({
      status: "duplicate",
      listingId: "listing-1",
      kaupetCode: "12345678",
    });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "create_listing_from_import_row",
      expect.objectContaining({ _import_id: importId }),
    );
  });
});
