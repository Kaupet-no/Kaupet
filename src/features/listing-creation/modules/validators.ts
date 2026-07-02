import type { AttributeMap } from "@/components/attribute-fields";

/**
 * Extra validation beyond category_filters' required-field check, keyed by
 * module key. Kept free of React/UI imports so it can run both client-side
 * (step gating in ny-annonse.tsx) and server-side (createListing in
 * listings.functions.ts) without pulling component code into the server bundle.
 */
export const MODULE_VALIDATORS: Record<string, (attributes: AttributeMap) => string | null> = {
  "vehicle-lookup": (attrs) =>
    attrs.is_registered && !attrs.registration_number
      ? "Fyll inn registreringsnummer eller fjern haken for registrert kjøretøy"
      : null,
};

/** Runs every active module's validator against `attributes`; returns the first error, if any. */
export function validateModules(moduleKeys: string[], attributes: AttributeMap): string | null {
  for (const key of moduleKeys) {
    const error = MODULE_VALIDATORS[key]?.(attributes);
    if (error) return error;
  }
  return null;
}
