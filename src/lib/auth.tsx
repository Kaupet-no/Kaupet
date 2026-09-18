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
      // supabase-js invokes this callback synchronously with the current
      // session right as we subscribe, tagged as the INITIAL_SESSION event
      // (e.g. when a session is already persisted) — that lands inside this
      // effect's own call stack, before React fully considers the component
      // mounted, and previously logged "Can't perform a React state update
      // on a component that hasn't mounted yet." getSession() below already
      // covers the initial session (its result only ever arrives via a
      // microtask, guaranteed after mount), so skipping INITIAL_SESSION here
      // removes the race at its source instead of just narrowing the timing
      // window (an earlier queueMicrotask-based fix didn't fully eliminate
      // it — this warning still surfaced once, later, per
      // E2E-ROBUSTNESS-PLAN-STATUS-3.md).
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
