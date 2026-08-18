import { isValid, parse } from "date-fns";

/** `next_eu_control`/`first_registration_date` are stored/submitted as ISO
 * dates (`yyyy-MM-dd`) — matching the format SVV's fields already come in
 * as — but shown to the user as a calendar-picked `dd.MM.yyyy`. */
export function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
