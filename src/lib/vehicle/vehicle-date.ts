import { isValid, parse } from "date-fns";

/** `next_eu_control`/`first_registration_date` lagres og sendes som ISO-datoer
 * (`yyyy-MM-dd`) — samme format som SVV leverer. Denne parser dem for visning
 * som `dd.MM.yyyy` i filterchips og aktive filtre. */
export function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}
