import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { insert } = vi.hoisted(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert }) },
}));

import { logServerError } from "@/lib/server-error-log";

describe("logServerError", () => {
  afterEach(() => {
    insert.mockClear();
    vi.restoreAllMocks();
  });

  it("keeps safe identifiers and status while excluding error details from console and DB", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "private query token and stack";
    const error = Object.assign(new Error(secret), {
      code: "23505",
      stack: secret,
    });
    await logServerError("saveListing", error, {
      listing_id: "123e4567-e89b-42d3-a456-426614174000",
      status: 503,
      privateText: secret,
    });

    const [entry] = insert.mock.calls[0] as [
      {
        error_message: string;
        error_code: string;
        context: Record<string, unknown>;
      },
    ];
    expect(entry).toEqual({
      function_name: "saveListing",
      error_message: "error",
      error_code: "23505",
      context: {
        listing_id: "123e4567-e89b-42d3-a456-426614174000",
        status: 503,
      },
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
  });

  it("does not trust arbitrary names or database codes", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await logServerError("safeOperation", {
      name: "PrivateError",
      code: "SECRE",
      message: "secret",
    });
    const [entry] = insert.mock.calls[0] as [{ error_message: string; error_code: string | null }];
    expect(entry.error_message).toBe("unknown");
    expect(entry.error_code).toBeNull();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("PrivateError");
  });

  it("does not persist Zod paths or submitted values", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = z.object({ email: z.string().email() }).safeParse({ email: "private-value" });
    if (error.success) throw new Error("fixture unexpectedly parsed");
    await logServerError("validateInput", error.error);
    const [entry] = insert.mock.calls[0] as [
      { error_message: string; context: Record<string, unknown> },
    ];
    expect(entry.error_message).toBe("error");
    expect(JSON.stringify(entry)).not.toContain("email");
    expect(JSON.stringify(entry)).not.toContain("private-value");
  });
});
