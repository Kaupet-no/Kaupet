import { AsyncLocalStorage } from "node:async_hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Simulerer det TanStack Start gjør i produksjon: forespørselen ligger i
// AsyncLocalStorage, og getCookies()/setCookie() treffer den forespørselen som
// er aktiv i det kallstakken kjører.
type Jar = {
  in: Record<string, string>;
  out: Array<{ name: string; options: unknown }>;
  protocol: "http" | "https";
  responseHeaders: Record<string, string>;
};
const requestStore = new AsyncLocalStorage<Jar>();

function currentJar(): Jar {
  const jar = requestStore.getStore();
  if (!jar) throw new Error("Ingen aktiv forespørsel");
  return jar;
}

vi.mock("@tanstack/react-start/server", () => ({
  getCookies: () => currentJar().in,
  getRequestProtocol: () => currentJar().protocol,
  setCookie: (name: string, _value: string, options: unknown) => {
    currentJar().out.push({ name, options });
  },
  setResponseHeader: (name: string, value: string) => {
    currentJar().responseHeaders[name] = value;
  },
}));

type CapturedCookies = {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (
    c: Array<{ name: string; value: string; options?: unknown }>,
    headers: Record<string, string>,
  ) => void;
};
let instanceCount = 0;

// Modellerer det som faktisk gjør en singleton farlig: den ekte
// GoTrueClient-en holder sesjonen i minnet på klientinstansen etter første
// lesing. Mocken memoiserer derfor på samme måte — uten det ville en delt
// klient sett "riktig" ut her, fordi mocken ellers leser kapsler på nytt ved
// hvert kall.
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: { cookies: CapturedCookies }) => {
    let cachedSession: Array<{ name: string; value: string }> | undefined;
    return {
      instanceId: ++instanceCount,
      cookies: opts.cookies,
      getSession() {
        cachedSession ??= opts.cookies.getAll();
        return cachedSession;
      },
    };
  }),
}));

const { getSupabaseServerClient } = await import("./session.server");
type TestClient = {
  instanceId: number;
  cookies: CapturedCookies;
  getSession: () => Array<{ name: string; value: string }>;
};

function inRequest<T>(
  cookies: Record<string, string>,
  fn: (jar: Jar) => Promise<T> | T,
  protocol: "http" | "https" = "https",
) {
  const jar: Jar = { in: cookies, out: [], protocol, responseHeaders: {} };
  return requestStore.run(jar, () => fn(jar));
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  instanceCount = 0;
});

describe("getSupabaseServerClient", () => {
  // REGRESJONSVERN: feiler hvis noen gjør serverklienten om til en singleton
  // eller en cache. Se sikkerhetskommentaren i session.server.ts.
  it("oppretter en ny klient for hvert kall", () => {
    const a = inRequest({}, () => getSupabaseServerClient()) as unknown as TestClient;
    const b = inRequest({}, () => getSupabaseServerClient()) as unknown as TestClient;
    expect(a.instanceId).not.toBe(b.instanceId);
    expect(a).not.toBe(b);
  });

  // DEN KRITISKE: to samtidige forespørsler fra ulike brukere skal ikke kunne
  // se hverandres sesjon. Kallene interleaves bevisst med await, slik at en
  // delt klient i modulomfang faktisk ville blitt avslørt.
  it("lar ikke to samtidige forespørsler se hverandres sesjon", async () => {
    const readFor = (user: string) =>
      inRequest({ "sb-access-token": `token-${user}` }, async () => {
        const client = getSupabaseServerClient() as unknown as TestClient;
        // Les sesjonen én gang (som ekte kode gjør), gi så den andre
        // forespørselen anledning til å kjøre, og les igjen. En delt klient
        // ville her servert den først innleste brukerens sesjon til begge.
        client.getSession();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return client.getSession();
      });

    const [alice, bob] = await Promise.all([readFor("alice"), readFor("bob")]);

    expect(alice).toEqual([{ name: "sb-access-token", value: "token-alice" }]);
    expect(bob).toEqual([{ name: "sb-access-token", value: "token-bob" }]);
  });

  it("skriver fornyet sesjon tilbake til forespørselens egne kapsler", async () => {
    const jar = await inRequest({}, async (j) => {
      const client = getSupabaseServerClient() as unknown as TestClient;
      client.cookies.setAll([{ name: "sb-access-token", value: "fornyet" }], {
        "Cache-Control": "private, no-store",
        Expires: "0",
        Pragma: "no-cache",
      });
      return j;
    });

    expect(jar.out).toHaveLength(1);
    expect(jar.out[0]!.name).toBe("sb-access-token");
    expect(jar.out[0]!.options).toMatchObject({
      path: "/",
      sameSite: "lax",
      secure: true,
      // Nettleserklienten må kunne lese sesjonen — se ADR-en.
      httpOnly: false,
    });
    expect(jar.responseHeaders).toEqual({
      "Cache-Control": "private, no-store",
      Expires: "0",
      Pragma: "no-cache",
    });
  });

  it("bruker forespørselsprotokollen for secure-attributtet", async () => {
    const jar = await inRequest(
      {},
      async (j) => {
        const client = getSupabaseServerClient() as unknown as TestClient;
        client.cookies.setAll([{ name: "sb-access-token", value: "fornyet" }], {});
        return j;
      },
      "http",
    );

    expect(jar.out[0]!.options).toMatchObject({ secure: false });
  });
});
