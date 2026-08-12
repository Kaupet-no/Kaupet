/** Gives the first upward scroll to a partial sheet instead of its content. */
export function expandSheetBeforeScroll(
  target: HTMLElement,
  expanded: boolean,
  expand: () => void,
): boolean {
  if (expanded || target.scrollTop <= 0) return false;
  target.scrollTop = 0;
  expand();
  return true;
}
