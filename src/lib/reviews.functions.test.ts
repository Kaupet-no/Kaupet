import { describe, expect, it, vi } from "vitest";

const supabaseAdmin = { from: vi.fn(), rpc: vi.fn() };

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown; context?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data), context: input.context });
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

import { listUserReviews } from "./reviews.functions";

const REVIEWEE_ID = "11111111-1111-4111-8111-111111111111";
const DELETED_REVIEWER = {
  id: "22222222-2222-4222-8222-222222222222",
  display_name: "Kari Nordmann",
  avatar_url: "https://example.com/avatar.png",
  deleted_at: "2026-08-01T00:00:00.000Z",
};

describe("listUserReviews (L-12)", () => {
  it("masks a deleted reviewer's name and avatar in the primary (FK-join) query path", async () => {
    const row = {
      id: "row-1",
      listing_id: "listing-1",
      reviewer_id: DELETED_REVIEWER.id,
      reviewee_id: REVIEWEE_ID,
      role: "buyer",
      rating: 5,
      comment: null,
      created_at: "2026-09-01T00:00:00.000Z",
      reviewer: DELETED_REVIEWER,
      listing: { id: "listing-1", kaupet_code: "AB12345", title: "En annonse" },
    };
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table !== "user_reviews") throw new Error(`unexpected table ${table}`);
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        range: async () => ({ data: [row], error: null }),
      };
      return chain;
    });

    const result = await listUserReviews({ data: { userId: REVIEWEE_ID } });
    expect(result).toHaveLength(1);
    expect(result[0].reviewer).toEqual({
      id: DELETED_REVIEWER.id,
      display_name: "Slettet bruker",
      avatar_url: null,
    });
  });
});
