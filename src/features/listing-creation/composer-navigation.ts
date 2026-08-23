export function composerForwardStep(nextStep: number, reviewStep: number, returnToReview: boolean) {
  return returnToReview ? reviewStep : nextStep;
}

type ComposerPage = { groups: { key: string }[] };

export function canPreviewDraft(pages: ComposerPage[], step: number, hasTitle: boolean) {
  return (
    hasTitle &&
    pages
      .slice(0, step - 1)
      .some((page) => page.groups.some((group) => group.key === "photos" || group.key === "title"))
  );
}

export function reviewSectionSteps(pages: ComposerPage[], groupKeys: readonly string[]) {
  const steps = pages.flatMap((page, index) =>
    page.groups.some((group) => groupKeys.includes(group.key)) ? [index + 1] : [],
  );
  return steps.length > 0 ? { first: steps[0], last: steps.at(-1)! } : null;
}

export type ComposerSwipeDirection = "back" | "forward";
export type ComposerNavigationResult = "advanced" | "blocked" | "busy";

export function composerSwipeDirection(
  deltaX: number,
  deltaY: number,
  threshold = 64,
  durationMs?: number,
): ComposerSwipeDirection | null {
  const horizontal = Math.abs(deltaX);
  const fastEnough = durationMs !== undefined && durationMs > 0 && horizontal / durationMs >= 0.5;
  if (
    (horizontal < threshold && !(fastEnough && horizontal >= threshold / 2)) ||
    horizontal < Math.abs(deltaY) * 1.25
  )
    return null;
  return deltaX < 0 ? "forward" : "back";
}
