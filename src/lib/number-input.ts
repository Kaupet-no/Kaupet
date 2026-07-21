/** Strips everything but digits, so pasted "1 000 000", "1.000.000" or
 * "1,000,000" all parse the same way, and clamps to `max` so typing/pasting
 * a longer number never produces a value a Zod `.max()` would reject. */
export function digitsOnlyClamped(value: string, max: number): string {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return digits;
  return Math.min(Number(digits), max).toString();
}

/** Renders a raw numeric string/number as space-grouped digits, nb-NO style
 * ("1 000 000"), so a large number is actually legible at a glance. */
export function formatThousands(value: string | number | undefined, max: number): string {
  const digits = value == null ? "" : digitsOnlyClamped(String(value), max);
  if (!digits) return "";
  return Number(digits).toLocaleString("nb-NO");
}
