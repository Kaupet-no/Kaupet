/** Feltdefinisjon og validering for lokasjonsskjemaet i bedriftskonsollet.
 * Ligger utenfor komponentfilen slik at valideringen kan testes direkte. */

export type LocationFormState = {
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
};

export type LocationErrors = Partial<Record<keyof LocationFormState | "terms", string>>;

export const LOCATION_FIELDS = [
  ["name", "Navn", "f.eks. Oslo butikk"],
  ["addressLine", "Gateadresse", "Storgata 1"],
  ["postalCode", "Postnummer", "0001"],
  ["city", "Poststed", "Oslo"],
] as const;

/** Speiler `locationInputSchema` i business.functions.ts, men med norske
 * meldinger per felt slik at Zod-feilen fra serveren aldri når brukeren.
 * `requireConsent` gjelder bare nye lokasjoner, som utløser fakturering. */
export function validateLocation(
  form: LocationFormState,
  { requireConsent, accepted }: { requireConsent: boolean; accepted: boolean } = {
    requireConsent: false,
    accepted: false,
  },
): LocationErrors {
  const errors: LocationErrors = {};
  for (const [field, label] of LOCATION_FIELDS) {
    if (!form[field].trim()) errors[field] = `${label} må fylles ut.`;
  }
  if (!errors.postalCode && !/^\d{4}$/u.test(form.postalCode.trim())) {
    errors.postalCode = "Postnummeret må være fire siffer.";
  }
  if (requireConsent && !accepted) {
    errors.terms = "Du må godta faktureringen og brukervilkårene for å opprette lokasjonen.";
  }
  return errors;
}
