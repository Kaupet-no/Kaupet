import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.types";
import { DRIVE_TYPE_LABEL_NB, FUEL_LABEL_NB, TRANSMISSION_LABEL_NB } from "./vehicle-labels";

type Row = { label: string; value: string };

/**
 * Full teknisk-data-tabell for kjøretøy-annonser, skjult bak en
 * "Vis teknisk informasjon"-dropdown under Utstyr-seksjonen — de viktigste
 * nøkkeltallene vises allerede sentralt i `VehicleInfoGrid`. Rendrer kun
 * rader det faktisk finnes data for — ingen tomme "—"-rader.
 */
export function VehicleTechTable({
  vehicleLookup,
  mileageKm,
  euControlExempt,
  driveType,
}: {
  vehicleLookup: VehicleLookupResult | null;
  mileageKm: number | null;
  /** Ikke en del av SVV-oppslaget — brukerens eget svar på om tilhengeren er
   * fritatt for periodisk kjøretøykontroll, lagret som en vanlig attributt
   * (ikke i `vehicle_lookup`-snapshoten). */
  euControlExempt?: boolean | null;
  /** Selgerens bekreftede verdi (`attributes.drive_type`), som har forrang
   * over `vehicleLookup.drive_type` — se `vehicle-info-grid.tsx`. */
  driveType?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rows: Row[] = [];

  if (mileageKm != null)
    rows.push({ label: "Kilometerstand", value: `${mileageKm.toLocaleString("nb-NO")} km` });
  if (vehicleLookup?.year) rows.push({ label: "Årsmodell", value: String(vehicleLookup.year) });
  if (vehicleLookup?.brand) rows.push({ label: "Merke", value: vehicleLookup.brand });
  if (vehicleLookup?.model) rows.push({ label: "Modell", value: vehicleLookup.model });
  if (vehicleLookup?.fuel_type)
    rows.push({
      label: "Drivstoff",
      value: FUEL_LABEL_NB[vehicleLookup.fuel_type] ?? vehicleLookup.fuel_type,
    });
  if (vehicleLookup?.transmission)
    rows.push({
      label: "Girkasse",
      value: TRANSMISSION_LABEL_NB[vehicleLookup.transmission] ?? vehicleLookup.transmission,
    });
  if (vehicleLookup?.power_hk)
    rows.push({ label: "Effekt", value: `${vehicleLookup.power_hk} hk` });
  if (driveType)
    rows.push({ label: "Hjuldrift", value: DRIVE_TYPE_LABEL_NB[driveType] ?? driveType });
  if (vehicleLookup?.weight_kg)
    rows.push({ label: "Vekt", value: `${vehicleLookup.weight_kg} kg` });
  if (vehicleLookup?.max_total_weight_kg)
    rows.push({ label: "Tillatt totalvekt", value: `${vehicleLookup.max_total_weight_kg} kg` });
  if (vehicleLookup?.length_m) rows.push({ label: "Lengde", value: `${vehicleLookup.length_m} m` });
  if (vehicleLookup?.tow_hitch != null)
    rows.push({
      label: "Hengerfeste",
      value: vehicleLookup.tow_hitch
        ? `Ja${vehicleLookup.max_tow_weight_kg ? ` (${vehicleLookup.max_tow_weight_kg} kg)` : ""}`
        : "Nei",
    });
  if (vehicleLookup?.seats)
    rows.push({ label: "Antall seter", value: String(vehicleLookup.seats) });
  if (vehicleLookup?.sleeping_places)
    rows.push({ label: "Antall soveplasser", value: String(vehicleLookup.sleeping_places) });
  if (vehicleLookup?.cylinders)
    rows.push({ label: "Antall sylindre", value: String(vehicleLookup.cylinders) });
  if (vehicleLookup?.engine_displacement_cc)
    rows.push({ label: "Slagvolum", value: `${vehicleLookup.engine_displacement_cc} cc` });
  if (vehicleLookup?.engine_code)
    rows.push({ label: "Motorkode", value: vehicleLookup.engine_code });
  if (vehicleLookup?.color) rows.push({ label: "Farge", value: vehicleLookup.color });
  if (vehicleLookup?.imported_used != null)
    rows.push({ label: "Bruktimportert", value: vehicleLookup.imported_used ? "Ja" : "Nei" });
  if (vehicleLookup?.first_registration_date)
    rows.push({ label: "Førstegangsregistrering", value: vehicleLookup.first_registration_date });
  if (euControlExempt == null) {
    if (vehicleLookup?.next_eu_control)
      rows.push({ label: "Neste EU-kontroll", value: vehicleLookup.next_eu_control });
  } else {
    rows.push({ label: "Fritatt for EU-kontroll", value: euControlExempt ? "Ja" : "Nei" });
    if (!euControlExempt && vehicleLookup?.next_eu_control)
      rows.push({ label: "Neste EU-kontroll", value: vehicleLookup.next_eu_control });
  }
  if (vehicleLookup?.vin) rows.push({ label: "VIN", value: vehicleLookup.vin });

  if (rows.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          Vis teknisk informasjon
          <ChevronDown
            className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 rounded-xl border border-border">
          <Table>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="w-1/2 text-muted-foreground">{row.label}</TableCell>
                  <TableCell className="font-medium">{row.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
