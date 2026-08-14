export function composerForwardStep(nextStep: number, reviewStep: number, returnToReview: boolean) {
  return returnToReview ? reviewStep : nextStep;
}
