import type { AttributeMap } from "@/components/attribute-fields";

/** "bmw" / "BMW" / "iX3" -> "Bmw" / "Bmw" / "Ix3" — first letter upper, rest lower. */
function capitalizeWord(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/**
 * Bygger kjøretøy-annonsers tittel av Årsmodell/Merke/Modell — samme logikk
 * brukt både i selve tittelvisningen (VehicleTitleFields,
 * description-keywords-steget) og for å kunne lagre et gyldig utkast
 * *før* brukeren når det steget (f.eks. for 360°-QR-panelet på
 * bildeopplastningssteget, som kommer tidligere i kjøretøyflyten).
 */
export function computeVehicleTitle(attributes: AttributeMap): string {
  return [attributes.year, capitalizeWord(attributes.brand), capitalizeWord(attributes.model)]
    .filter((v) => v !== undefined && v !== null && v !== "")
    .join(" ");
}
