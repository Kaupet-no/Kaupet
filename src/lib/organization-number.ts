const MODULUS_11_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Removes visual grouping and returns the nine-digit organization number. */
export function normalizeOrganizationNumber(value: string): string {
  return value.replace(/\s/g, "");
}

/** Validates the Norwegian organization-number Modulus-11 check digit. */
export function isValidOrganizationNumber(value: string): boolean {
  const normalized = normalizeOrganizationNumber(value);
  if (!/^\d{9}$/.test(normalized)) return false;

  const sum = MODULUS_11_WEIGHTS.reduce(
    (total, weight, index) => total + Number(normalized[index]) * weight,
    0,
  );
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit !== 10 && checkDigit === Number(normalized[8]);
}
