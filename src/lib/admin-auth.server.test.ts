import { describe, expect, it, vi } from "vitest";
import { requireAdminRole } from "./admin-auth.server";

function mockSupabase(maybeSingleResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(maybeSingleResult);
  const eqRole = vi.fn().mockReturnValue({ maybeSingle });
  const eqUserId = vi.fn().mockReturnValue({ eq: eqRole });
  const select = vi.fn().mockReturnValue({ eq: eqUserId });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as Parameters<typeof requireAdminRole>[0];
}

describe("requireAdminRole", () => {
  it("resolves when the user has the admin role", async () => {
    const supabase = mockSupabase({ data: { role: "admin" }, error: null });
    await expect(requireAdminRole(supabase, "user-1")).resolves.toBeUndefined();
  });

  it("throws 'Ikke autorisert' when the user has no admin row", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    await expect(requireAdminRole(supabase, "user-1")).rejects.toThrow("Ikke autorisert");
  });

  it("propagates a Supabase query error instead of swallowing it", async () => {
    const dbError = new Error("connection lost");
    const supabase = mockSupabase({ data: null, error: dbError });
    await expect(requireAdminRole(supabase, "user-1")).rejects.toThrow("connection lost");
  });
});
