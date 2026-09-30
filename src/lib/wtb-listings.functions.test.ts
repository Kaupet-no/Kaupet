import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertUserNotRateLimited, from } = vi.hoisted(() => ({
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
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/rate-limit.server", () => ({ assertUserNotRateLimited }));

import { createWtbListing, saveWtbDraft } from "./wtb-listings.functions";

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
              select: () => ({ single: async () => ({ data: { id: "wtb-id" }, error: null }) }),
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
