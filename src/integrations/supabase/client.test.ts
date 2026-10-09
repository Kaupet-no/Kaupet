// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClientMock, setSessionMock } = vi.hoisted(() => ({
  createBrowserClientMock: vi.fn(),
  setSessionMock: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: createBrowserClientMock }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "local-test-key");
  setSessionMock.mockReset().mockResolvedValue({ error: null });
  createBrowserClientMock.mockReset().mockReturnValue({ auth: { setSession: setSessionMock } });
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase browser auth callbacks", () => {
  it("DEF-INVITE-02: etablerer sesjon fra serverinvitasjon og rydder tokenfragmentet", async () => {
    window.history.replaceState(
      null,
      "",
      "/bedriftsinvitasjon#access_token=local-access&refresh_token=local-refresh&type=invite",
    );
    const { supabase } = await import("./client");
    void supabase.auth;
    await vi.waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith({
        access_token: "local-access",
        refresh_token: "local-refresh",
      }),
    );
    await vi.waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.pathname).toBe("/bedriftsinvitasjon");
  });

  it("lar SDK-en håndtere PKCE uten å sette en fragment-sesjon", async () => {
    window.history.replaceState(null, "", "/auth?code=local-code");
    const { supabase } = await import("./client");
    void supabase.auth;
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("beholder ugyldig tokenfragment når SDK-en avviser sesjonen", async () => {
    setSessionMock.mockResolvedValue({ error: new Error("Invalid token") });
    window.history.replaceState(
      null,
      "",
      "/bedriftsinvitasjon#access_token=invalid&refresh_token=invalid&type=invite",
    );
    const { supabase } = await import("./client");
    void supabase.auth;
    await vi.waitFor(() => expect(setSessionMock).toHaveBeenCalled());
    expect(window.location.hash).toContain("access_token=invalid");
  });
});
