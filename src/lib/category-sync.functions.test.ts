import { describe, expect, it, vi } from "vitest";

const { prod, staging } = vi.hoisted(() => ({
  prod: { rpc: vi.fn(), from: vi.fn() },
  staging: { rpc: vi.fn() },
}));

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, { client: (clientFn: (...args: unknown[]) => unknown) => clientFn }),
  }),
  createServerFn: () => {
    let handler: ((input: { context: unknown }) => unknown) | undefined;
    const fn = (input: { context: unknown }) => handler!(input);
    Object.assign(fn, {
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
vi.mock("@/lib/admin-auth.server", () => ({ requireAdminRole: vi.fn() }));
vi.mock("@/integrations/supabase/admin", () => ({ getSupabaseAdmin: async () => prod }));
vi.mock("@/integrations/supabase/staging-client.server", () => ({ stagingAdmin: staging }));

import {
  getCategorySyncDiff,
  getCategorySyncStatus,
  syncCategoriesFromStaging,
} from "./category-sync.functions";

type Tables = Partial<
  Record<"categories" | "category_filters" | "category_flows" | "filter_synonyms", unknown[]>
>;

const snapshot = (tables: Tables) => ({
  categories: [],
  category_filters: [],
  category_flows: [],
  filter_synonyms: [],
  default_search_examples: [],
  ...tables,
});

/** Begge miljøene svarer på category_sync_snapshot; produksjonen tar også
 * imot selve synken og leser sist synket. */
function serve(stagingTables: Tables, prodTables: Tables = {}) {
  staging.rpc.mockReset().mockResolvedValue({ data: snapshot(stagingTables), error: null });
  prod.rpc
    .mockReset()
    .mockImplementation(async (name: string) =>
      name === "category_sync_snapshot"
        ? { data: snapshot(prodTables), error: null }
        : { data: null, error: null },
    );
  prod.from.mockReset().mockReturnValue({
    select: () => ({
      eq: () => ({ single: async () => ({ data: { last_synced_at: "x" }, error: null }) }),
    }),
  });
}

const context = { context: { userId: "admin-1" } } as never;
const syncPayload = () =>
  prod.rpc.mock.calls.find(([name]) => name === "sync_categories_from_payload")?.[1];

// KG-06-F02: select("*") ga bare første 1000 rader, og sidevis henting kunne
// gi et blandet grunnlag. Synk-RPC-en sletter produksjonsrader som mangler.
describe("syncCategoriesFromStaging", () => {
  it("sender hele snapshotet fra staging, også over radgrensen", async () => {
    const filters = Array.from({ length: 1010 }, (_, i) => ({ id: `f${i}` }));
    serve({ categories: [{ id: "c1" }], category_filters: filters });
    await syncCategoriesFromStaging(context);
    expect(staging.rpc).toHaveBeenCalledWith("category_sync_snapshot");
    expect(syncPayload().p_category_filters).toHaveLength(1010);
    expect(syncPayload().p_categories).toEqual([{ id: "c1" }]);
  });

  it("synker ikke når snapshotet ikke kan leses", async () => {
    serve({});
    staging.rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(syncCategoriesFromStaging(context)).rejects.toThrow();
    expect(syncPayload()).toBeUndefined();
  });
});

const category = (id: string, slug: string, parent_id: string | null, updated_at = "x") => ({
  id,
  slug,
  parent_id,
  name_nb: slug,
  created_at: "x",
  updated_at,
});

describe("getCategorySyncStatus", () => {
  it("er ajour når innholdet er likt, selv med ulike UUID-er", async () => {
    serve(
      { categories: [category("s-a", "a", null)] },
      { categories: [category("p-a", "a", null)] },
    );
    expect(await getCategorySyncStatus(context)).toMatchObject({ inSync: true });
  });

  // KG-06-F02: en sletting i staging endrer ingen updated_at, så den gamle
  // tidsstempelsammenligningen meldte «ajour».
  it("er ikke ajour når en kategori er slettet i staging", async () => {
    serve(
      { categories: [category("s-a", "a", null)] },
      { categories: [category("p-a", "a", null), category("p-b", "b", null)] },
    );
    expect(await getCategorySyncStatus(context)).toMatchObject({ inSync: false });
  });
});

// KG-21-F02: parent_id ble fjernet fra sammenligningen, så en flytting alene
// ga ingen diff og kunne ikke synkes.
describe("getCategorySyncDiff", () => {
  it("viser en kategori som bare har byttet forelder som endret", async () => {
    serve(
      {
        categories: [
          category("s-a", "a", null),
          category("s-b", "b", null),
          category("s-child", "barn", "s-b"),
        ],
      },
      {
        categories: [
          category("p-a", "a", null),
          category("p-b", "b", null),
          category("p-child", "barn", "p-a"),
        ],
      },
    );
    const diff = await getCategorySyncDiff(context);
    expect(diff.categories.updated.map((u) => u.after.slug)).toEqual(["barn"]);
  });

  it("ser bort fra ulike UUID-er når forelderen er den samme", async () => {
    serve(
      { categories: [category("s-a", "a", null), category("s-child", "barn", "s-a")] },
      { categories: [category("p-a", "a", null), category("p-child", "barn", "p-a")] },
    );
    const diff = await getCategorySyncDiff(context);
    expect(diff.categories.updated).toEqual([]);
  });
});
