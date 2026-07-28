import { createContext, useContext } from "react";

import type { CategoryBehavior } from "@/lib/category-behavior";
import type { ListingFieldPatch } from "./save-listing-field";

export type FieldStatus = "idle" | "saving" | "saved" | "error";

export type ListingEditContextValue = {
  editMode: boolean;
  listingId: string;
  behavior: CategoryBehavior;
  saveField: (patch: ListingFieldPatch) => Promise<void>;
  fieldStatus: Record<string, FieldStatus>;
  openVehicleLookupModal: () => void;
  openCategoryModal: () => void;
};

export const ListingEditContext = createContext<ListingEditContextValue | null>(null);

export function useListingEdit(): ListingEditContextValue | null {
  return useContext(ListingEditContext);
}
