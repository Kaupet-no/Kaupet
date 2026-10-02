import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) => Object.assign(fn, { client: () => undefined }),
  }),
  createServerFn: () => {
    let validator = (value: unknown) => value;
    const fn: Record<string, unknown> = {
      middleware: () => fn,
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (handler: (args: unknown) => unknown) => (input: { data: unknown }) =>
        handler({
          data: validator(input.data),
          context: {
            userId: "user-1",
            supabase: { from: () => ({ upsert: db.upsert }) },
          },
        }),
    };
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));

import { savePushSubscription } from "./push.functions";

const validSubscription = {
  platform: "web",
  endpoint: "https://fcm.googleapis.com/fcm/send/token?opaque=1",
  p256dh: Buffer.from(
    "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5",
    "hex",
  ).toString("base64url"),
  auth: Buffer.alloc(16, 1).toString("base64url"),
};

beforeEach(() => db.upsert.mockReset().mockResolvedValue({ error: null }));

describe("savePushSubscription", () => {
  it("rejects an untrusted destination before database access", async () => {
    await expect(
      Promise.resolve().then(() =>
        savePushSubscription({
          data: { ...validSubscription, endpoint: "https://127.0.0.1/x" },
        } as never),
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed keys before database access", async () => {
    await expect(
      savePushSubscription({ data: { ...validSubscription, auth: "auth" } } as never),
    ).rejects.toThrow("Ugyldig push-abonnement");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("saves a valid provider subscription", async () => {
    await expect(
      savePushSubscription({
        data: {
          ...validSubscription,
          endpoint: "HTTPS://FCM.GOOGLEAPIS.COM:443/fcm/send/token?opaque=1",
        },
      } as never),
    ).resolves.toEqual({ ok: true });
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", endpoint: validSubscription.endpoint }),
      { onConflict: "endpoint" },
    );
  });
});
