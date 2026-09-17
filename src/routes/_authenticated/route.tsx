import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser, type SessionUser } from "@/lib/current-user.functions";

export const Route = createFileRoute("/_authenticated")({
  // SSR er på for dette layoutet slik at innloggede sider kan rendres av
  // serveren. Sesjonen ligger i informasjonskapsler (se
  // src/integrations/supabase/client.ts), så serveren kan lese den.
  //
  // Barneruter som ennå ikke er gjennomgått for SSR setter selv `ssr: false`.
  // Foreløpig er /mine-annonser den eneste som faktisk server-rendres.
  beforeLoad: async ({ location }): Promise<{ user: SessionUser }> => {
    // På serveren finnes ingen nettleserklient med sesjon — der leses
    // brukeren fra kapselen via en serverfunksjon. I nettleseren går vi
    // direkte på klienten, som er ett nettverkshopp mindre.
    const user =
      typeof window === "undefined"
        ? await getSessionUser()
        : await supabase.auth
            .getUser()
            .then(({ data, error }) =>
              error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null },
            );

    if (!user) {
      throw redirect({
        to: "/auth",
        search: { mode: "signin", returnTo: location.href },
      });
    }
    return { user };
  },
  component: () => <Outlet />,
});
