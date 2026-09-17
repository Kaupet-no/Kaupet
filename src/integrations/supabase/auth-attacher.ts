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
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
