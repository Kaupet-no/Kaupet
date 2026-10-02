import { beforeEach, describe, expect, it, vi } from "vitest";

const { deletePrefix, deleteObject, PrefixDeleteError } = vi.hoisted(() => {
  class PrefixDeleteError extends Error {
    constructor(
      message: string,
      readonly attemptedObjects: number,
      readonly deletedObjects: number,
    ) {
      super(message);
    }
  }
  return { deletePrefix: vi.fn(), deleteObject: vi.fn(), PrefixDeleteError };
});

vi.mock("@/lib/r2.server", () => ({
  deletePrefix: (...args: unknown[]) => deletePrefix(...args),
  deleteObject: (...args: unknown[]) => deleteObject(...args),
  PrefixDeleteError,
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

  const rpcCalls: { name: string; args: unknown }[] = [];
  const rpc = vi.fn(
    async (name: string, args: unknown): Promise<{ data: unknown; error: null }> => {
      rpcCalls.push({ name, args });
      return { data: name === "claim_orphan_standard_uploads" ? registryRows : null, error: null };
    },
  );

  return { from, rpc, deletedIds, updateCalls, rpcCalls };
}

let registryRows: { id: number; bucket: string; object_key: string; attempts: number }[] = [];

const supabaseAdminMock: {
  from: (name: string) => unknown;
  rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: null }>;
} = {
  from: () => {
    throw new Error("supabaseAdminMock.from not configured for this test");
  },
  rpc: async () => ({ data: [], error: null }),
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

function setAdmin(admin: ReturnType<typeof buildAdmin>) {
  supabaseAdminMock.from = admin.from;
  supabaseAdminMock.rpc = admin.rpc;
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
  deleteObject.mockReset().mockResolvedValue(undefined);
  registryRows = [];
  process.env.R2_CLEANUP_SECRET = "test-secret";
});

describe("r2 cleanup endpoint", () => {
  it("stopper når objektbudsjettet er brukt opp, og lar resten av batchen stå urørt", async () => {
    const rows = [row(1), row(2), row(3)];
    const admin = buildAdmin(rows);
    setAdmin(admin);
    // Det andre prefikset får bare resten av budsjettet. Når det fyller
    // budsjettet, blir kø-raden stående til neste kjøring.
    deletePrefix.mockResolvedValueOnce(300).mockResolvedValueOnce(200);

    const res = await post();
    const body = await res.json();

    expect(body).toEqual({ prefixes: 3, deletedObjects: 500, failed: 0, stopped: "budget" });
    expect(deletePrefix).toHaveBeenCalledTimes(2);
    expect(deletePrefix).toHaveBeenNthCalledWith(2, "BILDER", rows[1].prefix, 200);
    expect(admin.deletedIds).toEqual([1]);
    // Rad 2 ble bare delvis behandlet, og rad 3 ble aldri forsøkt.
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

  it("sletter bare registrerte eksakte nøkler og fjerner rad etter suksess", async () => {
    const admin = buildAdmin([]);
    setAdmin(admin);
    registryRows = [
      {
        id: 42,
        bucket: "BILDER",
        object_key:
          "11111111-1111-1111-1111-111111111111/avatar-22222222-2222-2222-2222-222222222222.jpg",
        attempts: 0,
      },
    ];

    const res = await post();
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("BILDER", registryRows[0].object_key);
    expect(admin.rpcCalls).toContainEqual({
      name: "finish_orphan_standard_upload",
      args: { _id: 42, _deleted: true },
    });
  });

  it("beholder en mislykket sletting retrybar med feildetalj", async () => {
    const admin = buildAdmin([]);
    setAdmin(admin);
    registryRows = [
      {
        id: 43,
        bucket: "VEDLEGG",
        object_key: "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg",
        attempts: 1,
      },
    ];
    deleteObject.mockRejectedValue(new Error("R2 nede"));

    await post();
    expect(admin.rpcCalls).toContainEqual({
      name: "finish_orphan_standard_upload",
      args: { _id: 43, _deleted: false, _error: "R2 nede" },
    });
  });

  it("regner med delvis sletting når et stort prefiks feiler", async () => {
    const rows = [row(1), row(2)];
    const admin = buildAdmin(rows);
    setAdmin(admin);
    deletePrefix
      .mockRejectedValueOnce(new PrefixDeleteError("R2 nede", 2, 1))
      .mockResolvedValueOnce(498);

    const res = await post();
    const body = await res.json();
    expect(body).toEqual({ prefixes: 2, deletedObjects: 499, failed: 1, stopped: "budget" });
    expect(deletePrefix).toHaveBeenNthCalledWith(2, "BILDER", rows[1].prefix, 498);
  });

  it("stopper etter fem registry-feil og lar ubehandlede claims retryes", async () => {
    const admin = buildAdmin([]);
    setAdmin(admin);
    registryRows = Array.from({ length: 6 }, (_, i) => ({
      id: 50 + i,
      bucket: "VEDLEGG",
      object_key: `11111111-1111-1111-1111-111111111111/${i.toString().padStart(8, "0")}-2222-3333-4444-555555555555.jpg`,
      attempts: 0,
    }));
    deleteObject.mockRejectedValue(new Error("R2 nede"));

    const res = await post();
    const body = await res.json();
    expect(body).toEqual({ prefixes: 6, deletedObjects: 0, failed: 5, stopped: "failures" });
    expect(deleteObject).toHaveBeenCalledTimes(5);
    expect(
      admin.rpcCalls.filter((call) => call.name === "finish_orphan_standard_upload"),
    ).toHaveLength(5);
    expect(deletePrefix).not.toHaveBeenCalled();
  });
});
