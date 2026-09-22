import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, {
        client: (clientFn: (...args: unknown[]) => unknown) => clientFn,
      }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: { userId: string } }) => unknown) | undefined;
    const fn = (input: { data?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data), context: { userId: "user-id" } });
    };
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

import { updateListingStatus } from "./listings.functions";

describe("updateListingStatus", () => {
  it("avviser aktiv-status som klienten forsøker å sette direkte", () => {
    expect(() =>
      updateListingStatus({
        data: { id: "00000000-0000-0000-0000-000000000001", status: "active" },
      }),
    ).toThrow();
  });
});
