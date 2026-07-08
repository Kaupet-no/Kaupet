import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VEHICLE_LEAF_SLUGS, type VehicleLeafSlug } from "@/lib/vehicle-classification";

import type { WizardSharedProps } from "../types";

const LEAF_LABELS_NB: Record<VehicleLeafSlug, string> = {
  personbil: "Personbil",
  varebil: "Varebil",
  "bobil-og-campingvogn": "Bobil/campingvogn",
  motorsykkel: "Motorsykkel",
  "moped-og-scooter": "Moped/scooter",
  "atv-og-snoscooter": "ATV/snøscooter",
  "tilhenger-leaf": "Tilhenger",
};

/**
 * Dedicated confirmation step for the vehicle-first flow: shown only after a
 * successful Statens Vegvesen lookup. Displays the auto-detected vehicle
 * type (editable, in case classification is missing/low-confidence or the
 * user disagrees) plus the full fetched data set, and requires an explicit
 * "Bekreft og fortsett" before the category/attributes are committed.
 */
export function VehicleConfirm({
  categories,
  vehicleLookupResult,
  vehicleClassification,
  confirmVehicleData,
  rejectVehicleLookup,
}: WizardSharedProps) {
  const detectedSlug = vehicleClassification?.slug ?? null;
  const [selectedSlug, setSelectedSlug] = useState<VehicleLeafSlug | null>(detectedSlug);

  if (!vehicleLookupResult) return null;
  const lookup = vehicleLookupResult;

  const leafBySlug = new Map(
    categories
      .filter((c) => c.slug && VEHICLE_LEAF_SLUGS.includes(c.slug as VehicleLeafSlug))
      .map((c) => [c.slug, c]),
  );

  return (
    <section className="space-y-3">
      <div className="space-y-2">
        <Label>Kjøretøytype</Label>
        {detectedSlug && vehicleClassification?.confidence === "high" ? (
          <p className="text-sm text-muted-foreground">
            Vi har funnet ut at dette er en{" "}
            <span className="font-medium text-foreground">{LEAF_LABELS_NB[detectedSlug]}</span>.
            Stemmer ikke dette?
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Vi klarte ikke å avgjøre kjøretøytype automatisk. Velg riktig type under.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {VEHICLE_LEAF_SLUGS.filter((slug) => leafBySlug.has(slug)).map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => setSelectedSlug(slug)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                selectedSlug === slug
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-primary/40"
              }`}
            >
              {LEAF_LABELS_NB[slug]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Opplysningene under er hentet fra Statens vegvesen. Du kan endre feltene under dersom noe er
        feil, men husk at du etter forbrukerkjøpsloven er ansvarlig for at opplysningene om
        kjøretøyet du oppgir i annonsen er korrekte — rett kun det som faktisk er feil.
      </div>

      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="font-medium">Data fra Statens vegvesen</p>
        {(lookup.year || lookup.brand || lookup.model) && (
          <p className="mt-1 text-muted-foreground">
            Tittel blir:{" "}
            <span className="font-medium text-foreground">
              {[lookup.year, lookup.brand, lookup.model].filter(Boolean).join(" ")}
            </span>
          </p>
        )}
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
          {lookup.brand && (
            <>
              <dt className="text-muted-foreground">Merke</dt>
              <dd>{lookup.brand}</dd>
            </>
          )}
          {lookup.model && (
            <>
              <dt className="text-muted-foreground">Modell</dt>
              <dd>{lookup.model}</dd>
            </>
          )}
          {lookup.year && (
            <>
              <dt className="text-muted-foreground">Årsmodell</dt>
              <dd>{lookup.year}</dd>
            </>
          )}
          {lookup.fuel_type && (
            <>
              <dt className="text-muted-foreground">Drivstoff</dt>
              <dd>{lookup.fuel_type}</dd>
            </>
          )}
          {lookup.weight_kg && (
            <>
              <dt className="text-muted-foreground">Egenvekt</dt>
              <dd>{lookup.weight_kg} kg</dd>
            </>
          )}
          {lookup.power_hk && (
            <>
              <dt className="text-muted-foreground">Effekt</dt>
              <dd>{lookup.power_hk} hk</dd>
            </>
          )}
          {lookup.drive_type && (
            <>
              <dt className="text-muted-foreground">Hjuldrift</dt>
              <dd>
                {lookup.drive_type === "4x4"
                  ? "Firehjulsdrift"
                  : lookup.drive_type === "bakhjul"
                    ? "Bakhjulsdrift"
                    : "Forhjulsdrift"}
              </dd>
            </>
          )}
          {lookup.transmission && (
            <>
              <dt className="text-muted-foreground">Girkasse</dt>
              <dd>{lookup.transmission === "automat" ? "Automat" : "Manuell"}</dd>
            </>
          )}
          {lookup.tow_hitch != null && (
            <>
              <dt className="text-muted-foreground">Hengerfeste</dt>
              <dd>
                {lookup.tow_hitch
                  ? `Ja${lookup.max_tow_weight_kg ? ` (${lookup.max_tow_weight_kg} kg)` : ""}`
                  : "Nei"}
              </dd>
            </>
          )}
          {lookup.seats && (
            <>
              <dt className="text-muted-foreground">Antall seter</dt>
              <dd>{lookup.seats}</dd>
            </>
          )}
          {selectedSlug === "bobil-og-campingvogn" && lookup.sleeping_places && (
            <>
              <dt className="text-muted-foreground">Antall soveplasser</dt>
              <dd>{lookup.sleeping_places}</dd>
            </>
          )}
          {lookup.imported_used != null && (
            <>
              <dt className="text-muted-foreground">Bruktimportert</dt>
              <dd>{lookup.imported_used ? "Ja" : "Nei"}</dd>
            </>
          )}
          {lookup.first_registration_date && (
            <>
              <dt className="text-muted-foreground">Førstegangsregistrering</dt>
              <dd>{lookup.first_registration_date}</dd>
            </>
          )}
          {lookup.color && (
            <>
              <dt className="text-muted-foreground">Farge</dt>
              <dd>{lookup.color}</dd>
            </>
          )}
          {lookup.next_eu_control && (
            <>
              <dt className="text-muted-foreground">Neste EU-kontroll</dt>
              <dd>{lookup.next_eu_control}</dd>
            </>
          )}
          {lookup.fuel_type !== "el" && lookup.cylinders && (
            <>
              <dt className="text-muted-foreground">Antall sylindre</dt>
              <dd>{lookup.cylinders}</dd>
            </>
          )}
          {lookup.fuel_type !== "el" && lookup.engine_displacement_cc && (
            <>
              <dt className="text-muted-foreground">Slagvolum</dt>
              <dd>{lookup.engine_displacement_cc} cc</dd>
            </>
          )}
          {lookup.fuel_type !== "el" && lookup.engine_code && (
            <>
              <dt className="text-muted-foreground">Motorkode</dt>
              <dd>{lookup.engine_code}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={rejectVehicleLookup}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Feil treff / kjøretøyet er ikke registrert
        </button>
        <Button
          type="button"
          disabled={!selectedSlug}
          onClick={() => {
            const leaf = selectedSlug ? leafBySlug.get(selectedSlug) : null;
            if (leaf) void confirmVehicleData(leaf.id);
          }}
        >
          Bekreft og fortsett
        </Button>
      </div>
    </section>
  );
}
