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
export function composerFieldId(field: string) {
  const ids: Record<string, string> = {
    category_id: "category-search-input",
    title: "title",
    subtitle: "subtitle",
    description: "description",
    condition: "condition-select",
    price_nok: "price_nok",
    postal_code: "postal_code",
    known_issues: "known_issues",
    maintenance_history: "maintenance_history",
    brand: "vehicle-brand",
    model: "vehicle-model",
    drive_type: "drive-type-select",
    axle_config: "axle-config-select",
  };
  return ids[field] ?? (field.startsWith("attr-") ? field : `attr-${field}`);
}

export function focusComposerField(field: string) {
  if (typeof document === "undefined") return false;
  const id = composerFieldId(field);
  const element = document.getElementById(id) ?? document.getElementsByName(field)[0];
  if (!(element instanceof HTMLElement)) return false;
  element.focus();
  element.scrollIntoView?.({ block: "center" });
  return true;
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
