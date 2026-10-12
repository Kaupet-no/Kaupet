import { beforeEach, describe, expect, it, vi } from "vitest";

const { prod, staging } = vi.hoisted(() => ({
  prod: { rpc: vi.fn(), from: vi.fn() },
  staging: { from: vi.fn() },
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

import { syncCategoriesFromStaging } from "./category-sync.functions";

const MAX_ROWS = 1000;

/** Etterligner PostgREST: range respekteres, men svaret kappes på max-rows. */
function stagingTables(sizes: Record<string, number>, { truncate = false } = {}) {
  staging.from.mockImplementation((table: string) => {
    if (table === "site_settings") {
      const single = { data: { default_search_examples: [] }, error: null };
      return { select: () => ({ eq: () => ({ single: async () => single }) }) };
    }
    const all = Array.from({ length: sizes[table] ?? 0 }, (_, i) => ({ id: `${table}-${i}` }));
    let from = 0;
    let to = Infinity;
    const query = {
      select: () => query,
      order: () => query,
      range: (start: number, end: number) => {
        from = start;
        to = end;
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => {
        const page = all.slice(from, Math.min(to + 1, from + MAX_ROWS));
        // Simulert feilside: siste side kommer tom tilbake.
        const data = truncate && from > 0 ? [] : page;
        return resolve({ data, error: null, count: all.length });
      },
    };
    return query;
  });
}

const call = () => syncCategoriesFromStaging({ context: { userId: "admin-1" } } as never);

// KG-06-F02: select("*") ga bare første 1000 rader, og synk-RPC-en slettet
// produksjonsrader som manglet i den avkortede payloaden.
describe("syncCategoriesFromStaging", () => {
  beforeEach(() => {
    prod.rpc.mockReset().mockResolvedValue({ error: null });
  });

  it("sender alle rader også over radgrensen", async () => {
    stagingTables({ categories: 3, category_filters: 1010, category_flows: 0, filter_synonyms: 1 });
    await call();
    const payload = prod.rpc.mock.calls[0][1];
    expect(payload.p_category_filters).toHaveLength(1010);
    expect(new Set(payload.p_category_filters.map((r: { id: string }) => r.id)).size).toBe(1010);
    expect(payload.p_categories).toHaveLength(3);
  });

  it("avviser ufullstendig henting før RPC-en kan slette noe", async () => {
    stagingTables(
      { categories: 3, category_filters: 1010, category_flows: 0, filter_synonyms: 1 },
      { truncate: true },
    );
    await expect(call()).rejects.toThrow(/Kunne ikke hente hele category_filters/);
    expect(prod.rpc).not.toHaveBeenCalled();
  });
});
