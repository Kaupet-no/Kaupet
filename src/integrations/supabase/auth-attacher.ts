import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
//
// Beholdt etter at sesjonen flyttet til informasjonskapsler. Kapsler sendes
// riktignok automatisk med på same-origin serverFn-kall, så headeren er
// redundant for web — men `requireSupabaseAuth` (auth-middleware.ts) krever
// fortsatt en Authorization-header, og å legge om alle de kallstedene er en
// større endring enn denne oppgaven. Verifisert i nettleser: med kapsler
// svarer getMyActivePromotions, getMyWtbListings og getBusinessOrganization
// fortsatt 200, altså virker denne veien uendret.
//
// Den dekker også native-WebViewen, der kapseltilgjengeligheten er mindre
// forutsigbar enn på web (se MainActivity.java om tredjepartskapsler i
// staging). Fjern den først sammen med en omlegging av requireSupabaseAuth
// til å lese sesjonen fra kapselen.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    // Denne client-middlewaren kjører også når en serverfunksjon kalles
    // in-process under SSR. Da finnes ingen nettleser-sesjon å feste, og å
    // røre `supabase` her ville konstruert NETTLESER-klienten på serveren —
    // som kaster hvis Supabase-miljøvariablene mangler, og dermed 500-et hele
    // siden. Siden rot-loaderen kaller en serverfunksjon på hver side, gjaldt
    // det all SSR. Serveren leser uansett sesjonen fra kapselen selv.
    if (typeof window === "undefined") return next();

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
