import { useQuery } from "@tanstack/react-query";

import { listSavedSearches, listUnreadCountsBySearch } from "@/lib/saved-searches";
import { useAuth } from "@/hooks/use-auth";

/** Innloggedes lagrede søk med antall nye treff. Samme nøkler som /mine-sok
 * og søkepanelet, så cachen deles. Tom liste for gjester. */
export function useSavedSearchesWithUnread(limit: number) {
  const { user } = useAuth();
  const { data: savedSearches } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: listSavedSearches,
    enabled: !!user,
  });
  const { data: unreadCounts } = useQuery({
    queryKey: ["saved-search-unread-counts"],
    queryFn: listUnreadCountsBySearch,
    enabled: !!user,
  });
  if (!user) return [];
  return (savedSearches ?? []).slice(0, limit).map((saved) => ({
    saved,
    unread: unreadCounts instanceof Map ? (unreadCounts.get(saved.id) ?? 0) : 0,
  }));
}

export const searchStartRowClass =
  "native-touch-target flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left";
