import { beforeEach, describe, expect, it, vi } from "vitest";

const deletePrefix = vi.fn();

vi.mock("@/lib/r2.server", () => ({
  deletePrefix: (...args: unknown[]) => deletePrefix(...args),
}));

type Row = { id: number; bucket: string; prefix: string; attempts: number };

function buildAdmin(rows: Row[]) {
  const deletedIds: number[] = [];
  const updateCalls: { id: number; attempts: number }[] = [];

  const from = (name: string) => {
    if (name !== "r2_delete_queue") throw new Error(`Unexpected table: ${name}`);
    return {
      select: () => ({
        lt: () => ({
          order: () => ({
            limit: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
      delete: () => ({
        eq: (_col: string, id: number) => {
          deletedIds.push(id);
          return Promise.resolve({ data: null, error: null });
        },
      }),
      update: (payload: { attempts: number }) => ({
        eq: (_col: string, id: number) => {
          updateCalls.push({ id, attempts: payload.attempts });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
  };

  return { from, deletedIds, updateCalls };
}

const supabaseAdminMock: { from: (name: string) => unknown } = {
  from: () => {
    throw new Error("supabaseAdminMock.from not configured for this test");
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

function setAdmin(admin: ReturnType<typeof buildAdmin>) {
  supabaseAdminMock.from = admin.from;
}

async function post() {
  const { Route } = await import("./cleanup");
  const request = new Request("http://localhost/api/public/r2/cleanup", {
    method: "POST",
    headers: { "x-r2-cleanup-secret": "test-secret" },
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.POST({ request });
}

function row(id: number): Row {
  return { id, bucket: "BILDER", prefix: `${id}/`, attempts: 0 };
}

beforeEach(() => {
  vi.resetModules();
  deletePrefix.mockReset();
  process.env.R2_CLEANUP_SECRET = "test-secret";
});

describe("r2 cleanup endpoint", () => {
  it("stopper når objektbudsjettet er brukt opp, og lar resten av batchen stå urørt", async () => {
    const rows = [row(1), row(2), row(3)];
    const admin = buildAdmin(rows);
    setAdmin(admin);
    // To prefikser på 300 objekter dekker budsjettet på 500 og bør stoppe
    // løkken før det tredje prefikset behandles.
    deletePrefix.mockResolvedValueOnce(300).mockResolvedValueOnce(300);

    const res = await post();
    const body = await res.json();

    expect(body).toEqual({ prefixes: 3, deletedObjects: 600, failed: 0, stopped: "budget" });
    expect(deletePrefix).toHaveBeenCalledTimes(2);
    expect(admin.deletedIds).toEqual([1, 2]);
    // Rad 3 ble aldri forsøkt, og skal derfor ikke ha fått attempts økt.
    expect(admin.updateCalls).toEqual([]);
  });

  it("stopper etter fem feil på rad, i stedet for å øke attempts på resten av batchen", async () => {
    const rows = [row(1), row(2), row(3), row(4), row(5), row(6)];
    const admin = buildAdmin(rows);
    setAdmin(admin);
    deletePrefix.mockRejectedValue(new Error("R2 nede"));

    const res = await post();
    const body = await res.json();

    expect(body).toEqual({ prefixes: 6, deletedObjects: 0, failed: 5, stopped: "failures" });
    expect(deletePrefix).toHaveBeenCalledTimes(5);
    // Radene 1-5 fikk attempts økt, rad 6 ble aldri forsøkt.
    expect(admin.updateCalls.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    expect(admin.updateCalls.every((c) => c.attempts === 1)).toBe(true);
  });

  it("nullstiller kretsbryteren ved en vellykket sletting mellom feilene", async () => {
    const rows = [row(1), row(2), row(3), row(4), row(5), row(6), row(7)];
    const admin = buildAdmin(rows);
    setAdmin(admin);
    // 4 feil, så en suksess, så 4 feil til — aldri 5 på rad, skal ikke stoppe.
    deletePrefix
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("a"))
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("a"));

    const res = await post();
    const body = await res.json();

    expect(body).toEqual({ prefixes: 7, deletedObjects: 1, failed: 6, stopped: null });
    expect(deletePrefix).toHaveBeenCalledTimes(7);
  });
});
