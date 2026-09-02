import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-error-log", () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));

import { logServerError } from "@/lib/server-error-log";
import { toClientError } from "./to-client-error.server";

describe("toClientError (L-14)", () => {
  it("logs the real error and returns a generic message for an unknown code", async () => {
    const raw = { message: 'column "seller_id" does not exist', code: "42703" };
    const err = await toClientError("someFn", raw, { listing_id: "abc" });
    expect(logServerError).toHaveBeenCalledWith("someFn", raw, { listing_id: "abc" });
    expect(err.message).toBe("Noe gikk galt. Prøv igjen senere.");
    expect(err.message).not.toContain("seller_id");
  });

  it("returns a safe, specific message for a known code (unique_violation)", async () => {
    const err = await toClientError("someFn", { message: "duplicate key", code: "23505" });
    expect(err.message).toBe("Finnes allerede.");
  });
});
