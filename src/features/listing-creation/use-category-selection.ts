import { useState, type MutableRefObject } from "react";

import type { AttributeMap } from "@/components/attribute-fields";

import type { WizardPage } from "./use-listing-steps";

export type PendingCategoryChange = {
  id: string;
  parentId: string;
  via: "wizard" | "sheet";
  kind: "select" | "deselect";
};

/**
 * Kategoritilstanden til annonseveiviseren. Delt i to hooks fordi tilstanden
 * må finnes tidlig (useVehicleLookupFlow, useListingTitleHints og
 * `fieldGroupKeys` trenger den før `pages`/steg-navigasjonen finnes), mens
 * handlerne (useCategorySelectionActions) trenger `currentPage` og
 * `goToNextPage` som først finnes etter at `pages` er regnet ut.
 */
export function useCategorySelectionState() {
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [pendingCategoryChange, setPendingCategoryChange] = useState<PendingCategoryChange | null>(
    null,
  );
  // True once the user has confirmed a category on the category-confirm step
  // (suggestion click or manual pick) — removes "category-confirm" from
  // fieldGroupKeys below for the rest of the session, so the page it occupied
  // simply disappears: "Neste" from photos never lands on it again, and
  // "Tilbake" from the page after it goes straight to photos. Never reset to
  // false — the title-click "Endre kategori" flow (see categoryEditConfirmOpen)
  // reopens the category picker sheet directly rather than this step.
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);
  const [categoryEditConfirmOpen, setCategoryEditConfirmOpen] = useState(false);
  const [editingCategoryViaTitle, setEditingCategoryViaTitle] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  // Needed early (by useVehicleLookupFlow's confirmVehicleData and
  // useListingTitleHints) — before `pages`/`goNext` exist, since `pages`
  // itself depends on the vehicle hook's vehicleLookupResult.
  const [categoryTouchedManually, setCategoryTouchedManually] = useState(false);

  return {
    categoryPickerOpen,
    setCategoryPickerOpen,
    pendingCategoryChange,
    setPendingCategoryChange,
    categoryConfirmed,
    setCategoryConfirmed,
    categoryEditConfirmOpen,
    setCategoryEditConfirmOpen,
    editingCategoryViaTitle,
    setEditingCategoryViaTitle,
    selectedParentId,
    setSelectedParentId,
    categoryTouchedManually,
    setCategoryTouchedManually,
  };
}

type CategorySelectionState = ReturnType<typeof useCategorySelectionState>;

export function useCategorySelectionActions({
  state,
  categoryId,
  bilOgMcCategoryId,
  attributes,
  setAttributes,
  setAttributesTouched,
  setValue,
  currentPage,
  goToNextPage,
  applyCategorySuggestion,
  returnToReviewRef,
  reviewSectionLastStepRef,
  setReviewJumpRequested,
  setStep,
  vehicleSubcategoryLocked,
  vehicleRegPageIndex,
}: {
  state: CategorySelectionState;
  categoryId: string;
  bilOgMcCategoryId: string | null;
  attributes: AttributeMap;
  setAttributes: (next: AttributeMap | ((prev: AttributeMap) => AttributeMap)) => void;
  setAttributesTouched: (touched: boolean) => void;
  setValue: (name: "category_id", value: string, options?: { shouldValidate?: boolean }) => void;
  currentPage: WizardPage | undefined;
  goToNextPage: () => unknown;
  applyCategorySuggestion: (id: string) => void;
  returnToReviewRef: MutableRefObject<boolean>;
  reviewSectionLastStepRef: MutableRefObject<number | null>;
  setReviewJumpRequested: (requested: boolean) => void;
  setStep: (step: number) => void;
  vehicleSubcategoryLocked: boolean;
  vehicleRegPageIndex: number;
}) {
  const {
    pendingCategoryChange,
    setPendingCategoryChange,
    setCategoryConfirmed,
    setCategoryEditConfirmOpen,
    editingCategoryViaTitle,
    setEditingCategoryViaTitle,
    setCategoryPickerOpen,
    setSelectedParentId,
    setCategoryTouchedManually,
  } = state;

  const applyCategorySelect = (via: "wizard" | "sheet", id: string, parentId: string) => {
    setCategoryTouchedManually(true);
    setSelectedParentId(parentId);
    setValue("category_id", id, { shouldValidate: true });
    if (via !== "wizard") return;
    if (currentPage?.groups?.some((g) => g.key === "category-select")) {
      goToNextPage();
    } else if (
      currentPage?.groups?.some(
        (g) => g.key === "category-confirm" || g.key === "category-attributes",
      )
    ) {
      setCategoryConfirmed(true);
    } else if (
      currentPage?.groups?.some((g) => g.key === "vehicle-registration") &&
      id !== bilOgMcCategoryId
    ) {
      // Uregistrert kjøretøy: lagre det som et eget, søkbart attributt (i
      // stedet for bare transient wizard-state) og rydd bort ev. tidligere
      // SVV-oppslagsdata, symmetrisk med is_registered: true i
      // confirmVehicleData. Ikke goNext() her — brukeren skal fylle inn de
      // samme tekniske feltene manuelt rett under kategorivelgeren på dette
      // steget før de går videre (se VehicleRegistration).
      setAttributes((prev) => {
        const next: AttributeMap = { ...prev, is_registered: false };
        delete next.registration_number;
        delete next.vehicle_lookup;
        return next;
      });
    }
  };

  // Switching to a different category mid-flow discards the category-specific
  // fields the user already filled — confirm before applying.
  // Re-opening the collapsed vehicle-registration category grid to pick a
  // different subcategory discards the same manually-filled fields as an
  // ordinary category switch, so it goes through the same confirm dialog.
  // Resets to the "Bil og MC" group itself (not ""), since an empty
  // category_id falls back to the generic non-vehicle flow/page set
  // (effectiveFlowForCategory(null, ...)) — that reshapes `pages` under the
  // wizard's still-current step index and reads as an unwanted jump forward.
  const requestCategoryDeselect = (parentId: string) => {
    const resetId = bilOgMcCategoryId ?? "";
    if (Object.keys(attributes).length > 0) {
      setPendingCategoryChange({ id: resetId, parentId, via: "wizard", kind: "deselect" });
      return;
    }
    applyCategorySelect("wizard", resetId, parentId);
  };

  const requestCategorySelect = (via: "wizard" | "sheet", id: string, parentId: string) => {
    // Picking a different underkategori while still on vehicle-registration
    // (the new icon grid over Merke/Modell) is deliberately friction-free —
    // no "may lose data" dialog — since nothing is considered committed
    // until the user actually leaves this page. See vehicleSubcategoryLocked
    // below for the (separate) confirm-gated flow once they have left it.
    const onVehicleRegPage = currentPage?.groups?.some((g) => g.key === "vehicle-registration");
    if (
      !onVehicleRegPage &&
      categoryId &&
      id !== categoryId &&
      Object.keys(attributes).length > 0
    ) {
      setPendingCategoryChange({ id, parentId, via, kind: "select" });
      return;
    }
    applyCategorySelect(via, id, parentId);
  };

  const applySuggestedCategory = (id: string) => {
    applyCategorySuggestion(id);
    if (currentPage?.groups?.some((group) => group.key === "category-select")) {
      goToNextPage();
    } else if (
      currentPage?.groups?.some(
        (group) => group.key === "category-confirm" || group.key === "category-attributes",
      )
    ) {
      setCategoryConfirmed(true);
    }
  };

  const confirmPendingCategoryChange = () => {
    if (!pendingCategoryChange) return;
    setAttributes({});
    setAttributesTouched(false);
    applyCategorySelect(
      pendingCategoryChange.via,
      pendingCategoryChange.id,
      pendingCategoryChange.parentId,
    );
    setPendingCategoryChange(null);
  };

  // Category picker bottom sheet
  const handleCategoryPickerOpenChange = (open: boolean) => {
    setCategoryPickerOpen(open);
    if (!open && editingCategoryViaTitle) {
      setEditingCategoryViaTitle(false);
      returnToReviewRef.current = false;
    }
  };

  const handleCategoryPickerSelect = (id: string, parentId: string) => {
    if (editingCategoryViaTitle) {
      // Already confirmed via categoryEditConfirmOpen below — apply
      // directly instead of routing through requestCategorySelect's own
      // (attribute-count-gated) confirm dialog, which would otherwise
      // double-prompt the user for the same change. Still discards
      // category-specific attributes on the way, same as
      // confirmPendingCategoryChange does for the ordinary mid-flow
      // category switch — they belonged to the old category and may
      // not even apply as fields under the new one.
      setEditingCategoryViaTitle(false);
      setAttributes({});
      setAttributesTouched(false);
      applyCategorySelect("sheet", id, parentId);
      if (returnToReviewRef.current) {
        setReviewJumpRequested(true);
        returnToReviewRef.current = false;
      }
      return;
    }
    requestCategorySelect("sheet", id, parentId);
  };

  // "Endre kategori" via siden tittelen (kun for intent+title-flyten, etter at
  // kategorien er bekreftet) — bekreft først, åpne så den vanlige manuelle
  // kategori-sheeten.
  const cancelCategoryEditConfirm = () => {
    returnToReviewRef.current = false;
    reviewSectionLastStepRef.current = null;
  };

  const confirmCategoryEdit = () => {
    setCategoryEditConfirmOpen(false);
    if (vehicleSubcategoryLocked && vehicleRegPageIndex >= 0) {
      setStep(vehicleRegPageIndex + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    setEditingCategoryViaTitle(true);
    setCategoryPickerOpen(true);
  };

  return {
    applyCategorySelect,
    requestCategoryDeselect,
    requestCategorySelect,
    applySuggestedCategory,
    confirmPendingCategoryChange,
    handleCategoryPickerOpenChange,
    handleCategoryPickerSelect,
    cancelCategoryEditConfirm,
    confirmCategoryEdit,
  };
}
