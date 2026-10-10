import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertUserNotRateLimited, assertNotRateLimited, from, rpc } = vi.hoisted(() => ({
  assertNotRateLimited: vi.fn(),
  rpc: vi.fn(),
  assertUserNotRateLimited: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, { client: (clientFn: (...args: unknown[]) => unknown) => clientFn }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: { userId: string } }) => unknown) | undefined;
    const fn = (input: { data: unknown; context?: { userId: string } }) =>
      handler!({ data: validator(input.data), context: input.context ?? { userId: "user-id" } });
    Object.assign(fn, {
      middleware: () => fn,
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from, rpc } }));
vi.mock("@/lib/rate-limit.server", () => ({ assertUserNotRateLimited, assertNotRateLimited }));

import {
  createWtbListing,
  listWtbListings,
  matchWtbListingsForListing,
  saveWtbDraft,
  updateWtbListing,
} from "./wtb-listings.functions";

const wtbInput = { title: "Ønsker meg en bil" };

describe("WTB creation quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertUserNotRateLimited.mockResolvedValue(undefined);
    from.mockReturnValue({
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: "wtb-id" }, error: null }) }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: "wtb-id" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
  });

  it("shares one ten-per-hour user bucket between new drafts and direct creation", async () => {
    await saveWtbDraft({ data: wtbInput });
    await createWtbListing({ data: wtbInput });

    expect(assertUserNotRateLimited).toHaveBeenNthCalledWith(
      1,
      "user-id",
      "wtb_creation",
      10,
      3600,
      "Du har opprettet for mange ønskes kjøpt-annonser den siste timen. Prøv igjen senere.",
    );
    expect(assertUserNotRateLimited).toHaveBeenNthCalledWith(
      2,
      "user-id",
      "wtb_creation",
      10,
      3600,
      expect.any(String),
    );
  });

  it("does not charge again when saving or publishing an existing draft", async () => {
    await saveWtbDraft({ data: { ...wtbInput, id: "00000000-0000-0000-0000-000000000001" } });
    await createWtbListing({
      data: { ...wtbInput, draftId: "00000000-0000-0000-0000-000000000001" },
    });

    expect(assertUserNotRateLimited).not.toHaveBeenCalled();
  });

  it("stops a new WTB insert when the shared bucket rejects its reservation", async () => {
    assertUserNotRateLimited.mockRejectedValue(new Error("limit"));

    await expect(saveWtbDraft({ data: wtbInput })).rejects.toThrow("limit");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("kjøpsønske etter tapt publiseringssvar", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  function rowStatus(status: string | null) {
    const update = vi.fn();
    from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      let lookup = false;
      chain.update = (fields: unknown) => {
        update(fields);
        return chain;
      };
      chain.select = (columns: string) => {
        lookup = columns === "status";
        return chain;
      };
      chain.eq = () => chain;
      // The draft update matches nothing: the row is no longer a draft.
      chain.maybeSingle = async () => ({
        data: lookup && status ? { status } : null,
        error: null,
      });
      return chain;
    });
    return update;
  }
  beforeEach(() => vi.clearAllMocks());

  it("bekrefter et allerede aktivt kjøpsønske i stedet for å feile", async () => {
    rowStatus("active");
    await expect(createWtbListing({ data: { ...wtbInput, draftId: id } })).resolves.toEqual({ id });
    await expect(saveWtbDraft({ data: { ...wtbInput, id } })).resolves.toEqual({
      id,
      published: true,
    });
  });

  it("avviser publisering av et utkast i annen tilstand", async () => {
    rowStatus("archived");
    await expect(createWtbListing({ data: { ...wtbInput, draftId: id } })).rejects.toMatchObject({
      status: 409,
    });
    rowStatus(null);
    await expect(saveWtbDraft({ data: { ...wtbInput, id } })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("offentlige WTB-lesninger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertNotRateLimited.mockResolvedValue(undefined);
  });

  it("listWtbListings ber ikke om * eller private kolonner", async () => {
    const select = vi.fn(() => ({ in: async () => ({ data: [], error: null }) }));
    from.mockReturnValue({ select });
    rpc.mockResolvedValue({ data: [{ id: "w1", total_count: 1 }], error: null });

    await listWtbListings({ data: {} });

    const columns = (select.mock.calls[0] as unknown as [string])[0];
    expect(columns).not.toMatch(/\*/u);
    expect(columns).not.toContain("notify_matches");
    expect(columns).not.toContain("draft_expiry_notified_at");
  });

  it("matchWtbListingsForListing rate-limiter med riktig bucket", async () => {
    rpc.mockResolvedValue({ data: [{ match_count: 2, max_price: 100 }], error: null });

    await matchWtbListingsForListing({ data: { title: "Sykkel" } });

    expect(assertNotRateLimited).toHaveBeenCalledWith("match-wtb-for-listing", 60, 300);
  });
});

describe("gjenåpning av kjøpsønske", () => {
  it("krever samme eier og oppfylt status, og fornyer utløpet", async () => {
    const chain = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { id: "wtb-id" }, error: null }),
    };
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    from.mockReturnValue(chain);
    await updateWtbListing({
      data: { id: "00000000-0000-0000-0000-000000000001", status: "active" },
    });
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-id");
    expect(chain.eq).toHaveBeenCalledWith("status", "fulfilled");
    const update = chain.update.mock.calls[0][0];
    expect(update.status).toBe("active");
    expect(new Date(update.expires_at).getTime()).toBeGreaterThan(Date.now() + 89 * 864e5);
  });
});
