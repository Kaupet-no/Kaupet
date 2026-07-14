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
): string | null {
  if (fieldGroups.includes("condition") && values.condition == null) {
    return "Velg en tilstand for annonsen.";
  }
  if (fieldGroups.includes("delivery-location") && values.can_ship == null) {
    return "Velg en leveringsmetode for annonsen.";
  }
  return null;
}
