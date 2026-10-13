import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type AuthUser } from "@/hooks/use-auth";
import type { SessionUser } from "@/lib/current-user.functions";

/** `initialUser` kommer fra serveren, som nå kan lese sesjonen fra kapselen
 * (se __root.tsx). Med den satt vet vi auth-tilstanden allerede ved første
 * maling, så headeren slipper skjelett-mellomtilstanden og brukermenyen
 * ligger i SSR-svaret. `undefined` betyr "ikke avgjort av serveren" — da
 * beholder vi den gamle oppførselen og venter på klienten.
 *
 * Konteksten eksponerer bevisst ingen `session` — se AuthState. */
export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: SessionUser | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(initialUser === undefined);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      // getSession() below seeds the initial user and clears `loading`.
      // INITIAL_SESSION carries that same session (supabase-js emits it
      // after its own initialization), so it is skipped to avoid setting the
      // user twice. Later events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED,
      // USER_UPDATED) keep the context current.
      if (event === "INITIAL_SESSION") return;
      setUser(s?.user ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}
