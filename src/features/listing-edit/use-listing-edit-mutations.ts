import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import type { CategoryBehavior } from "@/lib/category-behavior";
import { saveListingField, type ListingFieldPatch } from "./save-listing-field";
import type { FieldStatus } from "./edit-mode-context";

/**
 * Wraps `saveListingField` with per-field `fieldStatus` state (for the
 * inline "saving…"/"lagret"/error indicators) and invalidates the
 * `["listing", kaupetCode]` query on success so the view re-renders with the
 * persisted value.
 */
export function useListingEditMutations(params: {
  listingId: string;
  kaupetCode: string;
  behavior: CategoryBehavior;
}) {
  const { listingId, kaupetCode, behavior } = params;
  const queryClient = useQueryClient();
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldStatus>>({});
  const resetTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setStatus = useCallback((key: string, status: FieldStatus) => {
    setFieldStatus((curr) => ({ ...curr, [key]: status }));
    if (resetTimers.current[key]) clearTimeout(resetTimers.current[key]);
    if (status === "saved") {
      resetTimers.current[key] = setTimeout(() => {
        setFieldStatus((curr) => ({ ...curr, [key]: "idle" }));
      }, 1800);
    }
  }, []);

  const router = useRouter();
  const saveField = useCallback(
    async (patch: ListingFieldPatch) => {
      setStatus(patch.group, "saving");
      try {
        await saveListingField(listingId, patch, { behavior });
        setStatus(patch.group, "saved");
        await queryClient.invalidateQueries({ queryKey: ["listing", kaupetCode] });
        // Fanetittel/meta (pris, tittel) kommer fra route-loaderen, ikke
        // react-query — last den på nytt så <title> ikke viser gammel pris.
        void router.invalidate({ filter: (match) => match.routeId === "/$kaupetCode" });
      } catch (e) {
        setStatus(patch.group, "error");
        showErrorToast(formatErrorMessage(e, "Kunne ikke lagre endringen"));
        throw e;
      }
    },
    [listingId, kaupetCode, behavior, queryClient, router, setStatus],
  );

  return { saveField, fieldStatus };
}
