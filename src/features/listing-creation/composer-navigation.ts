export function composerForwardStep(nextStep: number, reviewStep: number, returnToReview: boolean) {
  return returnToReview ? reviewStep : nextStep;
}

export type ComposerSwipeDirection = "back" | "forward";
export type ComposerNavigationResult = "advanced" | "blocked" | "busy";

export function composerSwipeDirection(
  deltaX: number,
  deltaY: number,
  threshold = 64,
): ComposerSwipeDirection | null {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return null;
  return deltaX < 0 ? "forward" : "back";
}
