import type { WizardSharedProps, ComposerReviewStatus, ComposerReviewGroup } from "../types";

/**
 * Optional "gjør annonsen bedre"-forbedringer avledet fra samme
 * klassifisering som publiseringskravene (registry: recommendedForTrust /
 * optionalEnhancement) — ikke en egen regelmotor. Delt mellom
 * ReviewPublishGroup (mobil, øverst på Se over) og ny-annonse.tsx sin
 * desktop-aside (gjennom hele flyten), så de to alltid viser samme liste.
 * Egen fil (ikke review-publish/index.tsx) fordi den ikke er en komponent —
 * å eksportere den ved siden av komponentene der brøt fast refresh.
 */
export function deriveComposerImprovements(
  props: Pick<
    WizardSharedProps,
    | "improvementGroupKeys"
    | "improvementGroups"
    | "images"
    | "previewPrice"
    | "city"
    | "postalCode"
    | "isVehicle"
    | "onEditReviewSection"
  >,
): ComposerReviewStatus[] {
  const improvementGroups: ComposerReviewGroup[] =
    props.improvementGroups ??
    props.improvementGroupKeys.map((key) => ({
      key,
      classification:
        key === "vehicle-360" || key === "vehicle-equipment"
          ? ("optionalEnhancement" as const)
          : ("recommendedForTrust" as const),
    }));
  const improvementClassification = (key: string) =>
    improvementGroups.find((group) => group.key === key)?.classification ?? "recommendedForTrust";
  const editGroup = (key: string) => {
    const section =
      key === "category-select" || key === "category-confirm"
        ? "category"
        : key === "photos" || key === "title"
          ? "content"
          : key === "delivery" || key === "location"
            ? "location"
            : "details";
    props.onEditReviewSection(section, { groupKey: key });
  };
  return (
    [
      props.improvementGroupKeys.includes("photos") && props.images.length === 0
        ? {
            key: "photos",
            label: "Legg til bilder",
            classification: improvementClassification("photos"),
            onAction: () => editGroup("photos"),
          }
        : null,
      props.improvementGroupKeys.some((key) => key === "price" || key === "vehicle-price") &&
      !props.previewPrice
        ? {
            key: "price",
            label: "Oppgi pris",
            classification: improvementClassification(
              props.improvementGroupKeys.includes("price") ? "price" : "vehicle-price",
            ),
            onAction: () =>
              editGroup(props.improvementGroupKeys.includes("price") ? "price" : "vehicle-price"),
          }
        : null,
      props.improvementGroupKeys.includes("location") && !props.city && !props.postalCode
        ? {
            key: "location",
            label: "Oppgi sted",
            classification: improvementClassification("location"),
            onAction: () => editGroup("location"),
          }
        : null,
      props.isVehicle && props.improvementGroupKeys.includes("vehicle-360")
        ? {
            key: "vehicle-360",
            label: "Ta 360°-opptak",
            classification: improvementClassification("vehicle-360"),
            onAction: () => editGroup("vehicle-360"),
          }
        : null,
    ] as (ComposerReviewStatus | null)[]
  ).filter((item): item is ComposerReviewStatus => item !== null);
}
