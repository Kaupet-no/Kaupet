export function composerForwardStep(nextStep: number, reviewStep: number, returnToReview: boolean) {
  return returnToReview ? reviewStep : nextStep;
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
