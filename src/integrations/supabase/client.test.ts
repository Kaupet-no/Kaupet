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
  it("DEF-INVITE-02: fanger invitasjonstokens og rydder fragmentet uten å bytte sesjon selv", async () => {
    window.history.replaceState(
      null,
      "",
      "/bedriftsinvitasjon#access_token=local-access&refresh_token=local-refresh&type=invite",
    );
    const { invitationTokens } = await import("./client");
    expect(invitationTokens()).toEqual({
      access_token: "local-access",
      refresh_token: "local-refresh",
    });
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/bedriftsinvitasjon");
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    "/#access_token=attacker&refresh_token=attacker&type=invite",
    "/bedriftsinvitasjon#access_token=attacker&refresh_token=attacker&type=magiclink",
  ])("ignorerer og fjerner tokens utenfor invitasjonsflyten: %s", async (path) => {
    window.history.replaceState(null, "", path);
    const { invitationTokens } = await import("./client");
    expect(invitationTokens()).toBeNull();
    expect(window.location.hash).toBe("");
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("lar SDK-en håndtere PKCE uten å sette en fragment-sesjon", async () => {
    window.history.replaceState(null, "", "/auth?code=local-code");
    const { invitationTokens } = await import("./client");
    expect(invitationTokens()).toBeNull();
    expect(window.location.search).toBe("?code=local-code");
  });
});
