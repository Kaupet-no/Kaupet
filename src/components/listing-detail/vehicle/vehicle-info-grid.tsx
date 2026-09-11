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

import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.types";
import {
  BODY_TYPE_LABEL_NB,
  COLOR_LABEL_NB,
  DRIVE_TYPE_LABEL_NB,
  FUEL_LABEL_NB,
  TRANSMISSION_LABEL_NB,
} from "./vehicle-labels";

/** Seller-entered attributes take precedence over the SVV snapshot, which is
 * null for every listing created via "Kjøretøyet er ikke registrert, eller jeg
 * vil ikke oppgi registreringsnummer". Those sellers fill the same facts in by
 * hand as required wizard fields; before this fallback existed the grid read
 * only from `vehicleLookup` and silently dropped all of it. */
const attrStr = (attributes: Attrs, key: string): string | null => {
  const v = attributes[key];
  return typeof v === "string" && v.trim() ? v : null;
};
const attrNum = (attributes: Attrs, key: string): number | null => {
  const v = attributes[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

type Attrs = Record<string, unknown>;

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
  attributes,
}: {
  vehicleLookup: VehicleLookupResult | null;
  mileageKm: number | null;
  /** Ikke en del av SVV-oppslaget — brukerens eget svar på om kjøretøyet er
   * fritatt for periodisk kjøretøykontroll (se `vehicle-tech-table.tsx`). */
  euControlExempt?: boolean | null;
  /** The listing's own `attributes`, used wherever the SVV snapshot is null. */
  attributes?: Attrs;
  /** Selgerens bekreftede verdi (`attributes.drive_type`), som har forrang
   * over `vehicleLookup.drive_type` — SVV eksponerer ofte ikke akseldata, så
   * SVV-snapshotet er `null` selv når selgeren har bekreftet hjuldriften. */
  driveType?: string | null;
}) {
  const attrs = attributes ?? {};
  const items: SpecItem[] = [];

  if (mileageKm != null) {
    items.push({
      key: "mileage",
      icon: Gauge,
      label: "Kilometer",
      value: formatMileage(mileageKm),
    });
  }
  const fuelType = vehicleLookup?.fuel_type ?? attrStr(attrs, "fuel_type");
  if (fuelType) {
    items.push({
      key: "fuel",
      icon: Fuel,
      label: "Drivstoff",
      value: FUEL_LABEL_NB[fuelType] ?? fuelType,
    });
  }
  const transmission = vehicleLookup?.transmission ?? attrStr(attrs, "transmission");
  if (transmission) {
    items.push({
      key: "transmission",
      icon: Cog,
      label: "Girkasse",
      value: TRANSMISSION_LABEL_NB[transmission] ?? transmission,
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
  const powerHk = vehicleLookup?.power_hk ?? attrNum(attrs, "power_hk");
  if (powerHk) {
    items.push({ key: "power", icon: Zap, label: "Effekt", value: `${powerHk} hk` });
  }
  const seats = vehicleLookup?.seats ?? attrNum(attrs, "seats");
  if (seats) {
    items.push({ key: "seats", icon: Users, label: "Seter", value: `${seats} seter` });
  }
  if (euControlExempt) {
    items.push({
      key: "eu_control",
      icon: CalendarCheck,
      label: "EU-kontroll",
      value: "Fritatt for EU-kontroll",
    });
  } else {
    const nextEuControl = vehicleLookup?.next_eu_control ?? attrStr(attrs, "next_eu_control");
    if (nextEuControl) {
      items.push({
        key: "eu_control",
        icon: CalendarCheck,
        label: "Frist EU-kontroll",
        value: formatDate(nextEuControl),
      });
    }
  }
  if (vehicleLookup?.first_registration_date) {
    items.push({
      key: "first_registration",
      icon: CalendarDays,
      label: "1. gang registrert",
      value: formatDate(vehicleLookup.first_registration_date),
    });
  }
  const color = vehicleLookup?.color ?? attrStr(attrs, "color");
  if (color) {
    items.push({
      key: "color",
      icon: Palette,
      label: "Farge",
      value: COLOR_LABEL_NB[color] ?? color,
    });
  }
  const bodyType = vehicleLookup?.body_type_hint ?? attrStr(attrs, "body_type");
  if (bodyType) {
    items.push({
      key: "body_type",
      icon: Car,
      label: "Karosseri",
      value: BODY_TYPE_LABEL_NB[bodyType] ?? bodyType,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="@container mt-6">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 @md:grid-cols-4">
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
