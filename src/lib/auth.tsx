import { useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext } from "@/hooks/use-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      setSession(s);
      setUser(s?.user ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, user, loading }}>{children}</AuthContext.Provider>;
}
