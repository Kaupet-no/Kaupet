import { Calendar, Fuel, Gauge, Cog, Zap } from "lucide-react";

import type { VehicleLookupResult } from "@/lib/vehicle-lookup.server";

const FUEL_LABEL_NB: Record<string, string> = {
  bensin: "Bensin",
  diesel: "Diesel",
  el: "El",
  hybrid: "Hybrid",
};

const TRANSMISSION_LABEL_NB: Record<string, string> = {
  manuell: "Manuell",
  automat: "Automat",
};

function formatMileage(mileageKm: number): string {
  return `${mileageKm.toLocaleString("nb-NO")} km`;
}

type SpecItem = { icon: React.ComponentType<{ className?: string }>; label: string };

/**
 * Fremtredende spec-rad rett under pris, à la mobile.no sin bruktbil-annonse
 * — de nøkkeltallene en kjøper ser først (km, årsmodell, drivstoff, girkasse,
 * effekt). Skjuler stille felt uten data i stedet for å vise tomme verdier.
 */
export function VehicleSpecBar({
  vehicleLookup,
  mileageKm,
}: {
  vehicleLookup: VehicleLookupResult | null;
  mileageKm: number | null;
}) {
  const items: SpecItem[] = [];

  if (mileageKm != null) {
    items.push({ icon: Gauge, label: formatMileage(mileageKm) });
  }
  if (vehicleLookup?.year) {
    items.push({ icon: Calendar, label: String(vehicleLookup.year) });
  }
  if (vehicleLookup?.fuel_type) {
    items.push({
      icon: Fuel,
      label: FUEL_LABEL_NB[vehicleLookup.fuel_type] ?? vehicleLookup.fuel_type,
    });
  }
  if (vehicleLookup?.transmission) {
    items.push({
      icon: Cog,
      label: TRANSMISSION_LABEL_NB[vehicleLookup.transmission] ?? vehicleLookup.transmission,
    });
  }
  if (vehicleLookup?.power_hk) {
    items.push({ icon: Zap, label: `${vehicleLookup.power_hk} hk` });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 font-medium">
          <item.icon className="size-4 text-muted-foreground" />
          {item.label}
        </div>
      ))}
    </div>
  );
}
