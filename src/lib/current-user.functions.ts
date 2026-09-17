import { createServerFn } from "@tanstack/react-start";

import { getSupabaseServerClient } from "@/integrations/supabase/session.server";

export type SessionUser = { id: string; email: string | null };

/** Den innloggede brukeren lest fra kapselsesjonen på serveren.
 *
 * Brukes av `_authenticated`-layoutet under SSR, der nettleserklienten ikke
 * har noen sesjon å lese. Klienten bruker fortsatt sin egen klient direkte —
 * det er ett nettverkshopp mindre enn å gå via denne. */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    // Kjører i rot-loaderen på HVER side. Uten Supabase-konfig finnes det per
    // definisjon ingen sesjon, så vi rendrer utlogget i stedet for å kaste og
    // ta ned hele siden. Smoke-testen i CI kjører den bygde workeren uten
    // secrets nettopp for å fange at `/` slutter å svare 200.
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return null;

    const supabase = getSupabaseServerClient();

    // getClaims() verifiserer tokenet lokalt mot JWKS (prosjektet signerer med
    // ES256) i stedet for å gå til /auth/v1/user for hver forespørsel. Denne
    // kjører i rot-loaderen på HVER side, så et nettverkshopp her ville lagt
    // seg på all SSR. Samme mønster som auth-middleware.ts.
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;

    const email = data.claims.email;
    return { id: data.claims.sub, email: typeof email === "string" ? email : null };
  },
);
