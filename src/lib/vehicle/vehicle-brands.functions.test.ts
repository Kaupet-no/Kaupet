import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertUserNotRateLimited, maybeSingle, insert, supabaseAdmin } = vi.hoisted(() => ({
  assertUserNotRateLimited: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  supabaseAdmin: { from: vi.fn() },
}));

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
    const fn = (input: { data?: unknown; context?: { userId: string } } = {}) =>
      handler!({
        data: validator(input.data),
        context: input.context ?? { userId: "11111111-1111-4111-8111-111111111111" },
      });
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
vi.mock("@/lib/rate-limit.server", () => ({ assertUserNotRateLimited }));

import { createVehicleBrand, createVehicleModel } from "./vehicle-brands.functions";

beforeEach(() => {
  vi.clearAllMocks();
  assertUserNotRateLimited.mockResolvedValue(undefined);
  maybeSingle.mockResolvedValue({ data: null, error: null });
  insert.mockReturnValue({
    select: () => ({
      single: vi.fn().mockResolvedValue({
        data: { id: "33333333-3333-4333-8333-333333333333", name: "Test", status: "pending" },
        error: null,
      }),
    }),
  });
  supabaseAdmin.from.mockReturnValue({
    select: () => ({ eq: () => ({ ilike: () => ({ maybeSingle }) }) }),
    insert,
  });
});

describe("vehicleforslag", () => {
  const invoke = (fn: unknown, input: unknown) =>
    (fn as (options: unknown) => Promise<unknown>)(input);

  it("stopper forslag før database-skriving når brukerens kvote er brukt opp", async () => {
    assertUserNotRateLimited.mockRejectedValue(new Error("For mange forespørsler"));

    await expect(
      invoke(createVehicleBrand, {
        data: { name: "Test", categoryGroup: "bil" },
        context: { userId: "11111111-1111-4111-8111-111111111111" },
      }),
    ).rejects.toThrow("For mange forespørsler");

    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("bruker samme per-bruker kvote for merke og modell", async () => {
    await invoke(createVehicleBrand, {
      data: { name: "Test", categoryGroup: "bil" },
      context: { userId: "11111111-1111-4111-8111-111111111111" },
    });
    await invoke(createVehicleModel, {
      data: {
        brandId: "22222222-2222-4222-8222-222222222222",
        name: "Testmodell",
      },
      context: { userId: "11111111-1111-4111-8111-111111111111" },
    });

    expect(assertUserNotRateLimited).toHaveBeenNthCalledWith(
      1,
      "11111111-1111-4111-8111-111111111111",
      "vehicle_suggestion",
      10,
      3600,
    );
    expect(assertUserNotRateLimited).toHaveBeenNthCalledWith(
      2,
      "11111111-1111-4111-8111-111111111111",
      "vehicle_suggestion",
      10,
      3600,
    );
  });
});
