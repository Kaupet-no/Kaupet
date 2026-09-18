// Forespørselsavgrenset Supabase-klient som bærer den innloggede brukerens
// sesjon fra informasjonskapslene. Bruker RLS som brukeren — dette er IKKE
// service-role (se `client.server.ts` for den).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  getCookies,
  getRequestProtocol,
  setCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";
import type { Database } from "./types";

export type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

function createSupabaseServerClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      // `getCookies()`/`setCookie()` leser og skriver den AMBIENTE
      // forespørselen (TanStack Start holder den i AsyncLocalStorage). De er
      // derfor bundet til én forespørsel, og klienten under kan ikke se
      // kapslene til en annen forespørsel.
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        for (const [name, value] of Object.entries(headers)) setResponseHeader(name, value);
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, {
            ...(options as CookieOptions),
            path: "/",
            sameSite: "lax",
            // IKKE httpOnly: nettleserklienten (`client.ts`) må kunne lese
            // sesjonen for de direkte Supabase-kallene (spørringer, RPC,
            // storage og realtime-abonnementet på meldinger). En HttpOnly-
            // kapsel ville gjort nettleseren utlogget. Avviket fra
            // HttpOnly-kravet er dokumentert i
            // `docs/decisions/2026-09-17-sesjon-i-informasjonskapsler.md`.
            httpOnly: false,
            secure: getRequestProtocol() === "https",
          });
        }
      },
    },
  });
}

/**
 * Oppretter en NY Supabase-klient for den inneværende forespørselen.
 *
 * SIKKERHET — ikke gjør denne om til en singleton eller en cache.
 *
 * På Cloudflare Workers lever modulomfang på tvers av forespørsler i samme
 * isolat. En sesjonsbærende klient i modulomfang ville derfor kunne servere
 * én brukers sesjon til en annen brukers forespørsel. Derfor:
 *
 *   - ingen modulnivå-variabel holder resultatet her,
 *   - ingen cache med brukernøkkel (en slik cache har samme levetid som
 *     isolatet, og dermed samme problem),
 *   - klienten leser kapsler fra den ambiente forespørselen ved hvert kall.
 *
 * Kall denne i `beforeLoad`, i loaders og i serverfunksjoner, og la resultatet
 * være en lokal variabel som dør med forespørselen.
 *
 * Regresjonen er dekket av `session.server.test.ts` ("to samtidige
 * forespørsler fra ulike brukere ser ikke hverandres sesjon"), som feiler hvis
 * noen senere legger på en singleton.
 */
export function getSupabaseServerClient(): SupabaseServerClient {
  return createSupabaseServerClient();
}
