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
    } = supabase.auth.onAuthStateChange((_event, s) => {
      // supabase-js can invoke this callback synchronously with the current
      // session right as we subscribe (e.g. INITIAL_SESSION when a session
      // is already persisted) — that lands inside this effect's own call
      // stack, before React fully considers the component mounted, and logs
      // "Can't perform a React state update on a component that hasn't
      // mounted yet." Deferring to a microtask sidesteps that race.
      queueMicrotask(() => {
        setSession(s);
        setUser(s?.user ?? null);
      });
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
