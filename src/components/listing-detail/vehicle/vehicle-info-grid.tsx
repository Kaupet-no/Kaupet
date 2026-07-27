import { Car, Fuel, Gauge, Cog, MoveHorizontal, IdCard, Zap, Users, Palette } from "lucide-react";

import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.server";
import { DRIVE_TYPE_LABEL_NB, FUEL_LABEL_NB, TRANSMISSION_LABEL_NB } from "./vehicle-labels";

function formatMileage(mileageKm: number): string {
  return `${mileageKm.toLocaleString("nb-NO")} km`;
}

type SpecItem = {
  icon: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  key: string;
};

/**
 * Sentralt spec-rutenett for kjøretøy-annonser, à la mobile.no — ikon over
 * verdi for de nøkkeltallene en kjøper ser først. Skjuler stille felt uten
 * data i stedet for å vise tomme tiles.
 */
export function VehicleInfoGrid({
  vehicleLookup,
  mileageKm,
}: {
  vehicleLookup: VehicleLookupResult | null;
  mileageKm: number | null;
}) {
  const items: SpecItem[] = [];

  if (mileageKm != null) {
    items.push({ key: "mileage", icon: Gauge, value: formatMileage(mileageKm) });
  }
  if (vehicleLookup?.fuel_type) {
    items.push({
      key: "fuel",
      icon: Fuel,
      value: FUEL_LABEL_NB[vehicleLookup.fuel_type] ?? vehicleLookup.fuel_type,
    });
  }
  if (vehicleLookup?.transmission) {
    items.push({
      key: "transmission",
      icon: Cog,
      value: TRANSMISSION_LABEL_NB[vehicleLookup.transmission] ?? vehicleLookup.transmission,
    });
  }
  if (vehicleLookup?.drive_type) {
    items.push({
      key: "drive_type",
      icon: MoveHorizontal,
      value: DRIVE_TYPE_LABEL_NB[vehicleLookup.drive_type] ?? vehicleLookup.drive_type,
    });
  }
  if (vehicleLookup?.registrationNumber) {
    items.push({
      key: "regnr",
      icon: IdCard,
      value: (
        <span className="rounded border border-border bg-background px-2 py-0.5 font-mono uppercase tracking-wide">
          {vehicleLookup.registrationNumber}
        </span>
      ),
    });
  }
  if (vehicleLookup?.body_type_hint) {
    items.push({ key: "body_type", icon: Car, value: vehicleLookup.body_type_hint });
  }
  if (vehicleLookup?.power_hk) {
    items.push({ key: "power", icon: Zap, value: `${vehicleLookup.power_hk} hk` });
  }
  if (vehicleLookup?.seats) {
    items.push({ key: "seats", icon: Users, value: String(vehicleLookup.seats) });
  }
  if (vehicleLookup?.color) {
    items.push({ key: "color", icon: Palette, value: vehicleLookup.color });
  }

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col items-center gap-1.5 text-center text-sm">
          <item.icon className="size-5 text-muted-foreground" />
          <span className="font-medium">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
