import { useMemo } from "react";

import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";
import {
  PART_BRAND_KEY,
  PART_FITMENT_SCOPE_KEY,
  PART_FITMENT_VEHICLE_IDS_KEY,
  PART_FITMENT_YEAR_FROM_KEY,
  PART_FITMENT_YEAR_TO_KEY,
  PART_NUMBER_KEY,
} from "@/lib/category-filters";

export function PartFitmentSummary({ attributes }: { attributes: Record<string, unknown> }) {
  const scope =
    typeof attributes[PART_FITMENT_SCOPE_KEY] === "string"
      ? attributes[PART_FITMENT_SCOPE_KEY]
      : null;
  const vehicleIds = Array.isArray(attributes[PART_FITMENT_VEHICLE_IDS_KEY])
    ? attributes[PART_FITMENT_VEHICLE_IDS_KEY].filter((id): id is string => typeof id === "string")
    : [];

  const { data: brands } = useAllVehicleBrands();
  const { data: models } = useAllVehicleModels();
  const brandNames = useMemo(
    () => new Map((brands ?? []).map((brand) => [brand.id, brand.name])),
    [brands],
  );
  const modelById = useMemo(
    () => new Map((models ?? []).map((model) => [model.id, model])),
    [models],
  );

  if (!scope) return null;

  const yearFrom =
    typeof attributes[PART_FITMENT_YEAR_FROM_KEY] === "number"
      ? attributes[PART_FITMENT_YEAR_FROM_KEY]
      : null;
  const yearTo =
    typeof attributes[PART_FITMENT_YEAR_TO_KEY] === "number"
      ? attributes[PART_FITMENT_YEAR_TO_KEY]
      : null;
  const yearLabel =
    yearFrom != null || yearTo != null ? `Årsmodell ${yearFrom ?? "…"}–${yearTo ?? "…"}` : null;
  const partBrand =
    typeof attributes[PART_BRAND_KEY] === "string" ? attributes[PART_BRAND_KEY].trim() : "";
  const partNumber =
    typeof attributes[PART_NUMBER_KEY] === "string" ? attributes[PART_NUMBER_KEY].trim() : "";

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display text-xl">Passer til</h2>
      {(partBrand || partNumber) && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {partBrand && (
            <div>
              <dt className="text-xs text-muted-foreground">Delmerke</dt>
              <dd>{partBrand}</dd>
            </div>
          )}
          {partNumber && (
            <div>
              <dt className="text-xs text-muted-foreground">Delenummer / OE-nummer</dt>
              <dd>{partNumber}</dd>
            </div>
          )}
        </dl>
      )}
      {scope === "universal" && <p className="mt-2 text-sm">Universal del</p>}
      {scope === "unknown" && (
        <p className="mt-2 text-sm">Selgeren har ikke oppgitt hvilke biler delen passer til.</p>
      )}
      {scope === "specific" && (
        <>
          {vehicleIds.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {vehicleIds.map((id) => {
                const model = modelById.get(id);
                return (
                  <li key={id} className="rounded-lg bg-card px-3 py-2 text-sm">
                    {model
                      ? `${brandNames.get(model.brand_id) ?? ""} ${model.name}`.trim()
                      : "Ukjent bilmodell"}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm">Ingen bestemt bilmodell er oppgitt.</p>
          )}
          {yearLabel && <p className="mt-3 text-sm text-muted-foreground">{yearLabel}</p>}
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Kilde: opplysninger gitt av selger. Kontroller delenummer og variant før kjøp.
      </p>
    </section>
  );
}
