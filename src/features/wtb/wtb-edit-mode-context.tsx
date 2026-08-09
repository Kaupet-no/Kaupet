import { createContext } from "react";

import type { FieldStatus } from "@/features/listing-edit/edit-mode-context";
import type { WtbFieldPatch } from "./save-wtb-listing-field";

export type WtbEditContextValue = {
  editMode: boolean;
  listingId: string;
  saveField: (patch: WtbFieldPatch) => Promise<void>;
  fieldStatus: Record<string, FieldStatus>;
};

export const WtbEditContext = createContext<WtbEditContextValue | null>(null);
