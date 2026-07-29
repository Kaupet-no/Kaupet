/**
 * Extracts the registration year from a first-registration date.
 *
 * The exact date is what Statens vegvesen gives us and what the listing page
 * shows, but the year is what everything else needs: the searchable
 * `first_registration_year` attribute (a from–to range filter — see
 * 20260729130000_first_registration_year_numeric.sql) and the
 * omregistreringsavgift calculation, which is banded by year.
 *
 * Matches the first four-digit group, so both "2018-05-14" and "14.05.2018"
 * resolve to 2018. Returns null for a missing or year-less value rather than
 * NaN, so callers can't accidentally propagate a broken number into a query.
 */
export function firstRegistrationYear(date: string | null | undefined): number | null {
  if (!date) return null;
  const match = /\d{4}/.exec(date);
  return match ? Number(match[0]) : null;
}
