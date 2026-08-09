import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { updateWtbListing } from "@/lib/wtb-listings.functions";
import type { FieldStatus } from "@/features/listing-edit/edit-mode-context";
import { saveWtbListingField, type WtbFieldPatch } from "./save-wtb-listing-field";

/** Mirrors `useListingEditMutations` for WTB listings — per-field
 * `fieldStatus` state plus `["wtb-listing", id]` invalidation on success. */
export function useWtbEditMutations(listingId: string) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateWtbListing);
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

  const saveField = useCallback(
    async (patch: WtbFieldPatch) => {
      setStatus(patch.group, "saving");
      try {
        await saveWtbListingField(listingId, patch, updateFn);
        setStatus(patch.group, "saved");
        await queryClient.invalidateQueries({ queryKey: ["wtb-listing", listingId] });
        await queryClient.invalidateQueries({ queryKey: ["my-wtb-listings"] });
      } catch (e) {
        setStatus(patch.group, "error");
        showErrorToast(formatErrorMessage(e, "Kunne ikke lagre endringen"));
        throw e;
      }
    },
    [listingId, updateFn, queryClient, setStatus],
  );

  return { saveField, fieldStatus };
}
