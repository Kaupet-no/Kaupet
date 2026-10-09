import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function readSupabaseEnv() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };
}

function createSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = readSupabaseEnv();

  // SIKKERHET — denne klienten ligger i modulomfang (se Proxy-en nederst), og
  // på Cloudflare Workers lever modulomfang på tvers av forespørsler i samme
  // isolat. En sesjonsbærende klient her ville derfor kunne lekke én brukers
  // sesjon inn i en annen brukers forespørsel. Klienten er derfor bevisst
  // sesjonsløs på serveren — nøyaktig som før kapselmigrasjonen.
  //
  // Serverkode som trenger brukerens sesjon skal bruke
  // `getSupabaseServerClient()` i `./session.server.ts`, som opprettes per
  // forespørsel og aldri caches. Se `session.server.test.ts`.
  if (typeof window === "undefined") {
    return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
  }

  // Nettleseren lagrer sesjonen i informasjonskapsler (ikke localStorage) slik
  // at serveren kan lese den og rendre innlogget tilstand ved første maling.
  const callbackHash = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = callbackHash.get("access_token");
  const refreshToken = callbackHash.get("refresh_token");
  const client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    // SSR forces PKCE; server-issued invitations have no PKCE verifier.
    auth: { detectSessionInUrl: (_url, params) => Boolean(params.error_description) },
    cookieOptions: {
      path: "/",
      // SameSite=Lax, ikke Strict: e-postbekreftelse, passordtilbakestilling og
      // bedriftsinvitasjon kommer inn som en top-level navigasjon fra et annet
      // nettsted (lenke i e-post). Strict ville holdt kapselen tilbake på
      // nettopp den første navigasjonen, slik at serveren rendret siden som
      // utlogget selv om brukeren har en gyldig sesjon. Lax sender kapselen på
      // top-level GET-navigasjoner — som er det SSR trenger — men ikke på
      // kryssopprinnelses-POST eller underressurser. Skriveveier er dessuten
      // dekket av den globale CSRF-middlewaren i `src/start.ts`, og muterende
      // GET er sperret av ESLint-regelen `no-mutating-get-server-fn`.
      sameSite: "lax",
      // Secure overalt unntatt ren http (lokal dev). Chrome/Firefox tillater
      // Secure på http://localhost, men Playwright og andre WebView-er er ikke
      // like konsekvente, så vi utleder den fra faktisk protokoll.
      secure: window.location.protocol === "https:",
    },
  });
  if (accessToken || refreshToken) {
    // Tokens never stay in the address bar or history, whether or not they are used.
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
    // Only the invitation page may adopt them, and it asks before replacing another
    // signed-in account (otherwise any link could silently swap the visitor's session).
    if (
      accessToken &&
      refreshToken &&
      window.location.pathname === "/bedriftsinvitasjon" &&
      callbackHash.get("type") === "invite"
    ) {
      pendingInvitationTokens = { access_token: accessToken, refresh_token: refreshToken };
    }
  }
  return client;
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;
let pendingInvitationTokens: { access_token: string; refresh_token: string } | null = null;

/** Tokens from a server-issued invitation link, captured when the browser client starts. */
export function invitationTokens() {
  void supabase.auth;
  return pendingInvitationTokens;
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
