/** Telefonnumre lagres normalisert: valgfri «+» og 8–15 siffer. Norske
 * nummer uten landskode lagres som 8 siffer. Speiler CHECK-constrainten
 * `organization_location_contacts_phone_format`. */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/gu, "").replace(/^00/u, "+");
  return /^\+?\d{8,15}$/u.test(compact) ? compact : null;
}

/** «12345678» → «123 45 678», «+4712345678» → «+47 123 45 678». */
export function formatPhone(phone: string): string {
  const match = /^(\+47)?(\d{3})(\d{2})(\d{3})$/u.exec(phone);
  if (!match) return phone;
  return [match[1], match[2], match[3], match[4]].filter(Boolean).join(" ");
}

export function phoneHref(phone: string): string {
  return `tel:${/^\d{8}$/u.test(phone) ? `+47${phone}` : phone}`;
}
