import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Holder React Query-cachen i takt med hvem som er innlogget. Felles for alle
 * utloggingsveier, siden lytteren ligger i roten (KG-01-F01).
 *
 * - Ny identitet (A → ut, A → B): avbryt og tøm hele cachen. invalidateQueries
 *   alene beholder A sine data, og en gjenmontert observer kan vise dem mens
 *   B sine data lastes.
 * - Innlogging fra anonym eller ny profil for samme bruker: invalider som før.
 * - INITIAL_SESSION / TOKEN_REFRESHED: bare noter brukeren; de fyrer ved hver
 *   mount/fanefokus og ville ellers refetche alt.
 */
export function createAuthQueryCacheHandler(queryClient: QueryClient) {
  let currentUserId: string | null = null;

  return (event: AuthChangeEvent, session: Session | null): "cleared" | "invalidated" | null => {
    const nextUserId = session?.user?.id ?? null;
    const previousUserId = currentUserId;
    currentUserId = nextUserId;

    if (previousUserId !== null && previousUserId !== nextUserId) {
      void queryClient.cancelQueries();
      queryClient.clear();
      return "cleared";
    }
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      void queryClient.invalidateQueries();
      return "invalidated";
    }
    return null;
  };
}
