import { afterEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

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
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fromMock },
}));

import { updateOwnAvatar } from "./profile.functions";

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalR2BaseUrl = process.env.R2_PUBLIC_BASE_URL;

afterEach(() => {
  fromMock.mockReset();
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalR2BaseUrl === undefined) delete process.env.R2_PUBLIC_BASE_URL;
  else process.env.R2_PUBLIC_BASE_URL = originalR2BaseUrl;
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

  it("godtar kanonisk R2-avatar for innlogget bruker", async () => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no");
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "user-id", display_name: "Test", avatar_url: "updated" },
      error: null,
    });
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: singleMock }) }) }),
    });

    await updateOwnAvatar({
      data: {
        avatarUrl:
          "https://bilder.kaupet.no/user-id/avatar-11111111-1111-1111-1111-111111111111.jpg",
      },
    });
    expect(singleMock).toHaveBeenCalled();
  });

  it("avviser R2-avatarer med en annen brukers sti", async () => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no");
    await expect(
      updateOwnAvatar({
        data: {
          avatarUrl:
            "https://bilder.kaupet.no/other-user/avatar-11111111-1111-1111-1111-111111111111.jpg",
        },
      }),
    ).rejects.toThrow("Ugyldig profilbilde");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
