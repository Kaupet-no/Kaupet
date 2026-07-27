import {
  Car,
  Fuel,
  Gauge,
  Cog,
  MoveHorizontal,
  Zap,
  Users,
  CalendarCheck,
  CalendarDays,
  Palette,
} from "lucide-react";

import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.server";
import { DRIVE_TYPE_LABEL_NB, FUEL_LABEL_NB, TRANSMISSION_LABEL_NB } from "./vehicle-labels";
import { RegistrationPlate } from "./registration-plate";

function formatMileage(mileageKm: number): string {
  return `${mileageKm.toLocaleString("nb-NO")} km`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type SpecItem = {
  /** Utelatt for `regnr` — kjennemerket er selvforklarende uten ikon over. */
  icon?: React.ComponentType<{ className?: string }>;
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
  euControlExempt,
  driveType,
}: {
  vehicleLookup: VehicleLookupResult | null;
  mileageKm: number | null;
  /** Ikke en del av SVV-oppslaget — brukerens eget svar på om kjøretøyet er
   * fritatt for periodisk kjøretøykontroll (se `vehicle-tech-table.tsx`). */
  euControlExempt?: boolean | null;
  /** Selgerens bekreftede verdi (`attributes.drive_type`), som har forrang
   * over `vehicleLookup.drive_type` — SVV eksponerer ofte ikke akseldata, så
   * SVV-snapshotet er `null` selv når selgeren har bekreftet hjuldriften. */
  driveType?: string | null;
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
  if (driveType) {
    items.push({
      key: "drive_type",
      icon: MoveHorizontal,
      value: DRIVE_TYPE_LABEL_NB[driveType] ?? driveType,
    });
  }
  if (vehicleLookup?.power_hk) {
    items.push({ key: "power", icon: Zap, value: `${vehicleLookup.power_hk} hk` });
  }
  if (vehicleLookup?.seats) {
    items.push({ key: "seats", icon: Users, value: `${vehicleLookup.seats} seter` });
  }
  if (euControlExempt) {
    items.push({ key: "eu_control", icon: CalendarCheck, value: "Fritatt for EU-kontroll" });
  } else if (vehicleLookup?.next_eu_control) {
    items.push({
      key: "eu_control",
      icon: CalendarCheck,
      value: formatDate(vehicleLookup.next_eu_control),
    });
  }
  if (vehicleLookup?.first_registration_date) {
    items.push({
      key: "first_registration",
      icon: CalendarDays,
      value: formatDate(vehicleLookup.first_registration_date),
    });
  }
  if (vehicleLookup?.color) {
    items.push({ key: "color", icon: Palette, value: vehicleLookup.color });
  }
  if (vehicleLookup?.body_type_hint) {
    items.push({ key: "body_type", icon: Car, value: vehicleLookup.body_type_hint });
  }

  if (vehicleLookup?.registrationNumber) {
    items.push({
      key: "regnr",
      value: <RegistrationPlate value={vehicleLookup.registrationNumber} className="h-[34px]" />,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="@container mt-6">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 @sm:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex min-w-0 flex-col items-center justify-center gap-1.5 text-center text-sm"
          >
            {item.icon && <item.icon className="size-5 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 font-medium leading-tight break-words">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
