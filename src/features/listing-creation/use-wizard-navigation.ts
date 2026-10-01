import { useEffect, useRef, useState } from "react";

import type { ComposerReviewEditOptions } from "./field-groups/types";
import { focusComposerField, reviewSectionSteps } from "./composer-navigation";
import { useListingSteps, type WizardPage } from "./use-listing-steps";

export type ReviewSection = "category" | "content" | "details" | "location";

const REVIEW_SECTION_GROUP_KEYS: Record<ReviewSection, string[]> = {
  category: ["category-select"],
  content: ["photos", "title"],
  details: [
    "category-attributes",
    "description-keywords",
    "price",
    "boat-facts",
    "vehicle-facts",
    "vehicle-price",
  ],
  location: ["delivery", "location"],
};

/** Stegene (første/siste, 1-indeksert) en review-redigering skal hoppe til:
 * eksplisitt `groupKey` først, ellers seksjonens vanlige feltgrupper. `null`
 * når ingen side har gruppene (f.eks. category-select i landing-flyten). */
export function reviewEditTarget(
  pages: WizardPage[],
  section: ReviewSection,
  options?: ComposerReviewEditOptions,
) {
  return (
    (options?.groupKey && reviewSectionSteps(pages, [options.groupKey])) ??
    reviewSectionSteps(pages, REVIEW_SECTION_GROUP_KEYS[section])
  );
}

/** Har brukeren kommet til siste steg i en review-redigering (og skal tilbake
 * til Se over i stedet for å gå til neste side)? */
export function isReviewEditFinished(
  returnToReview: boolean,
  step: number,
  reviewSectionLastStep: number | null,
) {
  return returnToReview && step === reviewSectionLastStep;
}

/**
 * Veiviserens navigasjon: steg-markøren (useListingSteps), lengste steg nådd,
 * og "rediger fra Se over → hopp tilbake"-flyten med ventende fokus/anker.
 *
 * Refene er bevisst refs (ikke state): de muteres og leses synkront i
 * hendelseshåndterere (goToNextPage, kategoribladet, goBack) og skal ikke
 * trigge re-render.
 */
export function useWizardNavigation({
  pages,
  categoryId,
  setValidationError,
  setCategoryEditConfirmOpen,
}: {
  pages: WizardPage[];
  categoryId: string;
  setValidationError: (message: string | null) => void;
  setCategoryEditConfirmOpen: (open: boolean) => void;
}) {
  const returnToReviewRef = useRef(false);
  const reviewSectionLastStepRef = useRef<number | null>(null);
  const pendingReviewFocusRef = useRef<string | null>(null);
  /** Set from `ComposerReviewEditOptions.reviewAnchor` when an edit is
   * started from the Se over-steget (a `data-preview-section` on the listing
   * page there) — consumed once we land back on review to scroll to that
   * section, per the "return goes back to where you left" rule (UI-guiden). */
  const returnFocusAnchorRef = useRef<string | null>(null);
  const [reviewJumpRequested, setReviewJumpRequested] = useState(false);
  const pendingRestoreStepKeyRef = useRef<string | null>(null);

  const {
    step,
    setStep,
    currentPage,
    goNext,
    goBack: goBackStep,
    isFirst,
    isLast,
  } = useListingSteps(pages);
  // Lengste steg brukeren har nådd. Stegraden viser bare mangler fra steg
  // brukeren allerede har gått forbi — felt man ennå ikke har sett skal ikke
  // meldes som feil (flyten guider dit selv).
  const [furthestStep, setFurthestStep] = useState(step);
  if (step > furthestStep) setFurthestStep(step);

  useEffect(() => {
    if (!reviewJumpRequested) return;
    const frame = requestAnimationFrame(() => {
      setStep(pages.length);
      setReviewJumpRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pages.length, reviewJumpRequested, setStep]);

  // Lander vi på Se over med et pending anker (satt av editReviewSection når
  // redigeringen startet derfra), scroll/fokuser dit i stedet for toppen —
  // ellers no-op (vanlig ankomst til review har ingen anker satt).
  useEffect(() => {
    if (step !== pages.length) return;
    const anchor = returnFocusAnchorRef.current;
    if (!anchor) return;
    returnFocusAnchorRef.current = null;
    const frame = requestAnimationFrame(() => {
      document
        .querySelector(`[data-testid="listing-review"] [data-preview-section="${anchor}"]`)
        ?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, pages.length]);

  const currentStepKey = currentPage?.groups[0]?.key ?? "unknown";

  function goBack() {
    // Mirrors the hidden Tilbake/Forrige buttons on category-confirm — this
    // is the single function behind the footer button, the shell's header
    // arrow, the native swipe deck, AND the browser/hardware back button (via
    // useComposerHistoryBack) — this
    // is what keeps all four consistent instead of just the visible buttons.
    returnToReviewRef.current = false;
    reviewSectionLastStepRef.current = null;
    pendingReviewFocusRef.current = null;
    goBackStep();
  }

  const editReviewSection = (section: ReviewSection, options?: ComposerReviewEditOptions) => {
    returnToReviewRef.current = true;
    pendingReviewFocusRef.current = options?.field ?? null;
    setValidationError(null);
    const target = reviewEditTarget(pages, section, options);
    if (!target) {
      pendingReviewFocusRef.current = null;
      // Landing-flyten har verken category-select eller (etter bekreftelse)
      // category-confirm igjen som steg, så "Endre kategori" fra
      // forhåndsvisningen har ingen side å hoppe til — den åpner samme
      // dialog som kategori-chippen i headeren i stedet.
      if (section === "category" && categoryId) {
        reviewSectionLastStepRef.current = null;
        setCategoryEditConfirmOpen(true);
        return;
      }
      returnToReviewRef.current = false;
      reviewSectionLastStepRef.current = null;
      return;
    }
    reviewSectionLastStepRef.current = target.last;
    returnFocusAnchorRef.current = options?.reviewAnchor ?? null;
    setStep(target.first);
    if (target.first === step && options?.field) {
      requestAnimationFrame(() => {
        focusComposerField(options.field!);
        pendingReviewFocusRef.current = null;
      });
    }
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const field = pendingReviewFocusRef.current;
    if (!field) return;
    let secondFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        focusComposerField(field);
        pendingReviewFocusRef.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [currentStepKey, step]);

  return {
    step,
    setStep,
    currentPage,
    goNext,
    goBack,
    isFirst,
    isLast,
    furthestStep,
    currentStepKey,
    editReviewSection,
    reviewJumpRequested,
    setReviewJumpRequested,
    returnToReviewRef,
    reviewSectionLastStepRef,
    pendingReviewFocusRef,
    pendingRestoreStepKeyRef,
  };
}
