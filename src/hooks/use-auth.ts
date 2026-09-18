import { createContext, useContext } from "react";

/** Konteksten seedes både fra en ekte Supabase-`User` (klienten) og fra
 * serverens kapselsesjon (`SessionUser`, se AuthProvider). De to har ikke
 * samme form — bare `id` og `email` er garantert til stede i begge ved
 * første maling. `AuthUser` smalner derfor typen til fellesmengden, i
 * stedet for å late som om vi alltid har en full `User`. */
export type AuthUser = { id: string; email?: string | null };

/** Bevisst uten `session`. Serveren kjenner brukeren fra kapselen (se
 * AuthProvider), men har ingen ekte `Session` å seede — den bærer
 * access_token/refresh_token, og å serialisere dem inn i SSR-payloaden ville
 * lagt tokenet i HTML-en i tillegg til kapselen. Et `session`-felt her ville
 * derfor vært null ved første maling mens `user` var satt, altså to felter
 * som er uenige om du er innlogget. Trenger du et token: bruk
 * `supabase.auth.getSession()` direkte. */
export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
