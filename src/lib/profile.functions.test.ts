import { afterEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
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
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fromMock },
}));

import { updateOwnAvatar } from "./profile.functions";

const originalSupabaseUrl = process.env.SUPABASE_URL;

afterEach(() => {
  fromMock.mockReset();
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
});

describe("updateOwnAvatar", () => {
  it("avviser avatar-URL-er utenfor brukerens Supabase-lagring", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";

    await expect(
      updateOwnAvatar({
        data: {
          avatarUrl: "https://attacker.example/storage/v1/object/public/avatars/user-id/a.png",
        },
      }),
    ).rejects.toThrow("Ugyldig profilbilde");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("oppdaterer avatar når origin og brukersti stemmer", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "user-id", display_name: "Test", avatar_url: "updated" },
      error: null,
    });
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });

    await expect(
      updateOwnAvatar({
        data: {
          avatarUrl:
            "https://project.supabase.co/storage/v1/object/public/avatars/user-id/avatar.png",
        },
      }),
    ).resolves.toEqual({ id: "user-id", display_name: "Test", avatar_url: "updated" });
    expect(updateMock).toHaveBeenCalledWith({
      avatar_url: "https://project.supabase.co/storage/v1/object/public/avatars/user-id/avatar.png",
    });
  });
});
