/**
 * Server-side authority for which listing fields a category's flow actually
 * requires, mirroring modules/validators.ts. The client never fully trusts
 * itself here: createListing re-derives requiredness from the same resolved
 * flow (effectiveFlowForCategory) instead of trusting whatever the client
 * sent, so a buggy/malicious client can't submit condition: null for a
 * category whose flow still includes the "condition" group.
 */
export function validateRequiredFieldGroups(
  fieldGroups: string[],
  values: { condition: string | null; can_ship: boolean | null },
  // Vehicle categories (Bil og MC) can't be shipped by post — their
  // "delivery-location" step only asks for a location, not a shipping
  // method (see DeliveryLocation's `!isVehicle` guard around the "Levering"
  // section), so `can_ship` is never set for them and shouldn't be required.
  isVehicle = false,
): string | null {
  if (fieldGroups.includes("condition") && values.condition == null) {
    return "Velg en tilstand for annonsen.";
  }
  if (fieldGroups.includes("delivery-location") && !isVehicle && values.can_ship == null) {
    return "Velg en leveringsmetode for annonsen.";
  }
  return null;
}
