import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertUserNotRateLimited, lookupVehicle } = vi.hoisted(() => ({
  assertUserNotRateLimited: vi.fn(),
  lookupVehicle: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
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
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/rate-limit.server", () => ({ assertUserNotRateLimited }));
vi.mock("@/lib/vehicle/vehicle-lookup.server", () => ({ lookupVehicle }));

import { lookupVehicleByRegNumber } from "./vehicle-lookup.functions";

describe("lookupVehicleByRegNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertUserNotRateLimited.mockResolvedValue(undefined);
  });

  it("reserves the per-user hourly quota before looking up a registration", async () => {
    assertUserNotRateLimited.mockRejectedValue(new Error("limit"));

    await expect(
      lookupVehicleByRegNumber({ data: { registrationNumber: "AB12345" } }),
    ).rejects.toThrow("limit");

    expect(assertUserNotRateLimited).toHaveBeenCalledWith(
      "user-id",
      "vehicle_lookup",
      20,
      3600,
      "For mange kjøretøyoppslag den siste timen. Fyll inn kjøretøyopplysningene manuelt i mellomtiden.",
    );
    expect(lookupVehicle).not.toHaveBeenCalled();
  });

  it("keeps the reservation when the external lookup fails", async () => {
    lookupVehicle.mockRejectedValueOnce(new Error("provider failure"));

    await expect(
      lookupVehicleByRegNumber({ data: { registrationNumber: "AB12345" } }),
    ).rejects.toThrow("provider failure");

    expect(assertUserNotRateLimited).toHaveBeenCalledTimes(1);
    expect(lookupVehicle).toHaveBeenCalledTimes(1);
    expect(assertUserNotRateLimited.mock.invocationCallOrder[0]).toBeLessThan(
      lookupVehicle.mock.invocationCallOrder[0],
    );
  });
});
