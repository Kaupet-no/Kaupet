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
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  key: string;
};

/**
 * Sentralt spec-rutenett for kjøretøy-annonser — hver flis har en liten
 * ikon+label-rad og verdien under, for de nøkkeltallene en kjøper ser først.
 * Skjuler stille felt uten data i stedet for å vise tomme tiles.
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
    items.push({
      key: "mileage",
      icon: Gauge,
      label: "Kilometer",
      value: formatMileage(mileageKm),
    });
  }
  if (vehicleLookup?.fuel_type) {
    items.push({
      key: "fuel",
      icon: Fuel,
      label: "Drivstoff",
      value: FUEL_LABEL_NB[vehicleLookup.fuel_type] ?? vehicleLookup.fuel_type,
    });
  }
  if (vehicleLookup?.transmission) {
    items.push({
      key: "transmission",
      icon: Cog,
      label: "Girkasse",
      value: TRANSMISSION_LABEL_NB[vehicleLookup.transmission] ?? vehicleLookup.transmission,
    });
  }
  if (driveType) {
    items.push({
      key: "drive_type",
      icon: MoveHorizontal,
      label: "Hjuldrift",
      value: DRIVE_TYPE_LABEL_NB[driveType] ?? driveType,
    });
  }
  if (vehicleLookup?.power_hk) {
    items.push({
      key: "power",
      icon: Zap,
      label: "Effekt",
      value: `${vehicleLookup.power_hk} hk`,
    });
  }
  if (vehicleLookup?.seats) {
    items.push({
      key: "seats",
      icon: Users,
      label: "Seter",
      value: `${vehicleLookup.seats} seter`,
    });
  }
  if (euControlExempt) {
    items.push({
      key: "eu_control",
      icon: CalendarCheck,
      label: "EU-kontroll",
      value: "Fritatt for EU-kontroll",
    });
  } else if (vehicleLookup?.next_eu_control) {
    items.push({
      key: "eu_control",
      icon: CalendarCheck,
      label: "Frist EU-kontroll",
      value: formatDate(vehicleLookup.next_eu_control),
    });
  }
  if (vehicleLookup?.first_registration_date) {
    items.push({
      key: "first_registration",
      icon: CalendarDays,
      label: "1. gang registrert",
      value: formatDate(vehicleLookup.first_registration_date),
    });
  }
  if (vehicleLookup?.color) {
    items.push({ key: "color", icon: Palette, label: "Farge", value: vehicleLookup.color });
  }
  if (vehicleLookup?.body_type_hint) {
    items.push({
      key: "body_type",
      icon: Car,
      label: "Karosseri",
      value: vehicleLookup.body_type_hint,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="@container mt-6">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 @sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-col items-start gap-1 text-sm">
            <div className="flex min-w-0 items-center gap-1">
              {item.icon && <item.icon className="size-[15px] shrink-0 text-muted-foreground" />}
              <span className="min-w-0 truncate text-xs text-muted-foreground">{item.label}</span>
            </div>
            <span className="min-w-0 font-medium leading-tight break-words">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
