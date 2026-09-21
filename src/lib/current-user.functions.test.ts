import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// `getSessionUser` er pakket i `createServerFn(...).handler(fn)`. Vi mocker
// `createServerFn` slik at `.handler(fn)` bare returnerer `fn` direkte, siden
// funksjonen ikke bruker validator/middleware/context. Dette betyr at testen
// IKKE dekker TanStack Starts egen serverfunksjon-kobling (RPC-oppsett,
// context-injeksjon), kun logikken inni handleren.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

const responseHeaders: Record<string, string> = {};
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: (name: string, value: string) => {
    responseHeaders[name] = value;
  },
}));

const getClaimsMock = vi.fn();
const getSupabaseServerClientMock = vi.fn(() => ({
  auth: { getClaims: getClaimsMock },
}));
vi.mock("@/integrations/supabase/session.server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

const { getSessionUser } = await import("./current-user.functions");

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  for (const key of Object.keys(responseHeaders)) delete responseHeaders[key];
  getClaimsMock.mockReset();
  getSupabaseServerClientMock.mockClear();
});

// Dekker sikkerhetsregresjonen: en gyldig sesjon bærer brukeridentitet i
// SSR-HTML-en og skal derfor ikke kunne caches i en delt cache.
describe("getSessionUser", () => {
  it("gyldig sesjon returnerer brukeren og setter Cache-Control: private, no-cache", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1", email: "user@example.com" } },
      error: null,
    });

    const result = await getSessionUser();

    expect(result).toEqual({ id: "user-1", email: "user@example.com" });
    expect(responseHeaders["Cache-Control"]).toBe("private, no-cache");
  });

  it("ingen sesjon returnerer null og setter ingen Cache-Control-header", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null }, error: null });

    const result = await getSessionUser();

    expect(result).toBeNull();
    expect(responseHeaders["Cache-Control"]).toBeUndefined();
  });

  it("manglende Supabase-miljøvariabler returnerer null uten å opprette klient eller sette header", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;

    const result = await getSessionUser();

    expect(result).toBeNull();
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
    expect(responseHeaders["Cache-Control"]).toBeUndefined();
  });
});

afterAll(() => {
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey;
});
