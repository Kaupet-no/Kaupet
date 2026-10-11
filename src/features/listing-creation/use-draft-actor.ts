import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const DRAFT_ACTOR_CHANGED_MESSAGE =
  "Kontoen er endret. Logg inn med opprinnelig konto for å fortsette med utkastet.";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A mounted composer never adopts another account's session or local draft. */
export function useDraftActor(userId: string | null, organizationId: string | null = null) {
  const [ownerId] = useState(userId);
  const [ownerOrganizationId] = useState(organizationId);
  const [sessionChanged, setSessionChanged] = useState(false);
  const current = useRef(true);
  useClientLayoutEffect(() => {
    current.current =
      userId === ownerId && organizationId === ownerOrganizationId && !sessionChanged;
  }, [userId, ownerId, organizationId, ownerOrganizationId, sessionChanged]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) !== ownerId) {
        current.current = false;
        setSessionChanged(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [ownerId]);
  const isCurrent = useCallback(() => current.current, []);
  return {
    ownerId,
    ownerOrganizationId,
    actorChanged: userId !== ownerId || organizationId !== ownerOrganizationId || sessionChanged,
    isCurrent,
  };
}
