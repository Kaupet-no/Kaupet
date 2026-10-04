import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useForegroundRefresh } from "@/hooks/use-foreground-refresh";
import { useIsAdmin } from "@/hooks/use-user-roles";

export const ADMIN_EVENTS_COUNT_KEY = ["admin-events-open-count"] as const;

/**
 * Antall åpne hendelser i admin-innboksen (`admin_events`). Vises som badge
 * på profilikonet, menyvalget «Administrasjon» og i admin-sidemenyen. Kun
 * administratorer — for alle andre er spørringen avslått og tallet 0.
 * Admin-sider som håndterer en hendelse invaliderer `ADMIN_EVENTS_COUNT_KEY`.
 */
export function useAdminOpenEventsCount(): number {
  const { data: isAdmin } = useIsAdmin();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ADMIN_EVENTS_COUNT_KEY,
    enabled: !!isAdmin,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("admin_events")
        .select("id", { count: "exact", head: true })
        .is("handled_at", null);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  useForegroundRefresh(() => qc.invalidateQueries({ queryKey: ADMIN_EVENTS_COUNT_KEY }), !!isAdmin);

  return isAdmin ? (data ?? 0) : 0;
}

/** Kalles etter admin-handlinger som kan ha lukket hendelser via triggerne. */
export function invalidateAdminEvents(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ADMIN_EVENTS_COUNT_KEY });
  void qc.invalidateQueries({ queryKey: ["admin-events"] });
}
