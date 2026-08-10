import {
  Anchor,
  BedDouble,
  CalendarDays,
  Cog,
  Fuel,
  Gauge,
  Ruler,
  Sailboat,
  Users,
  Zap,
} from "lucide-react";

/** Option-value → norsk label for båtens select-attributter (matcher
 * category_filters-options i boat_vertical-migrasjonen). */
const BOAT_TYPE_LABEL_NB: Record<string, string> = {
  bowrider: "Bowrider",
  cabincruiser: "Cabincruiser",
  daycruiser: "Daycruiser",
  flybridge: "Flybridge",
  jolle: "Jolle",
  pilothouse: "Pilothouse",
  rib: "RIB",
  seilbat: "Seilbåt",
  skjaergardsjeep: "Skjærgårdsjeep",
  speedbat: "Speedbåt",
  snekke: "Snekke",
  vannscooter: "Vannscooter",
  yacht: "Yacht",
  sjark_yrkesbat: "Sjark/Yrkesbåt",
  andre: "Andre",
};

const MOTOR_TYPE_LABEL_NB: Record<string, string> = {
  innenbords: "Innenbords",
  utenbords: "Utenbords",
  uten_motor: "Uten motor",
};

const CONSTRUCTION_LABEL_NB: Record<string, string> = {
  aluminium: "Aluminium",
  glassfiber: "Glassfiber",
  plast: "Plast",
  tre: "Tre",
  annet: "Annet",
};

const BOAT_FUEL_LABEL_NB: Record<string, string> = {
  bensin: "Bensin",
  diesel: "Diesel",
  el: "El",
  gass: "Gass",
  gass_bensin: "Gass+Bensin",
};

type Attrs = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Om annonsen er en båt — datadrevet på boat_type-attributtet (satt av
 * Båter-kategoriens category_filters), ikke en hardkodet slug. */
export function isBoatAttributes(attributes: Attrs): boolean {
  return !!str(attributes.boat_type);
}

/**
 * Sentralt spec-rutenett for båt-annonser, under bildekarusellen — speiler
 * VehicleInfoGrid for bil: Båttype, fot, årsmodell, motortype, drivstoff/hk
 * (hvis motor), sitteplasser (>0), sengeplasser (>0) og konstruksjon.
 */
export function BoatInfoGrid({ attributes }: { attributes: Attrs }) {
  const motorType = str(attributes.motor_type);
  const hasMotor = motorType !== null && motorType !== "uten_motor";
  const seats = num(attributes.seats);
  const sleeping = num(attributes.sleeping_places);

  const items: {
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
  }[] = [];
  const boatType = str(attributes.boat_type);
  if (boatType) {
    items.push({
      key: "boat_type",
      icon: Sailboat,
      label: "Båttype",
      value: BOAT_TYPE_LABEL_NB[boatType] ?? boatType,
    });
  }
  const lengthFt = num(attributes.length_ft);
  if (lengthFt != null) {
    items.push({ key: "length_ft", icon: Ruler, label: "Størrelse", value: `${lengthFt} fot` });
  }
  const year = num(attributes.year) ?? str(attributes.year);
  if (year != null) {
    items.push({ key: "year", icon: CalendarDays, label: "Årsmodell", value: String(year) });
  }
  if (motorType) {
    items.push({
      key: "motor_type",
      icon: Cog,
      label: "Motortype",
      value: MOTOR_TYPE_LABEL_NB[motorType] ?? motorType,
    });
  }
  const fuel = str(attributes.fuel_type);
  if (hasMotor && fuel) {
    items.push({
      key: "fuel",
      icon: Fuel,
      label: "Drivstoff",
      value: BOAT_FUEL_LABEL_NB[fuel] ?? fuel,
    });
  }
  const powerHk = num(attributes.power_hk);
  if (hasMotor && powerHk != null) {
    items.push({ key: "power", icon: Zap, label: "Hestekrefter", value: `${powerHk} hk` });
  }
  const engineHours = num(attributes.engine_hours);
  if (engineHours != null) {
    items.push({
      key: "engine_hours",
      icon: Gauge,
      label: "Driftstimer",
      value: `${engineHours.toLocaleString("nb-NO")} t`,
    });
  }
  if (seats != null && seats > 0) {
    items.push({ key: "seats", icon: Users, label: "Sitteplasser", value: String(seats) });
  }
  if (sleeping != null && sleeping > 0) {
    items.push({
      key: "sleeping",
      icon: BedDouble,
      label: "Sengeplasser",
      value: String(sleeping),
    });
  }
  const construction = str(attributes.construction);
  if (construction) {
    items.push({
      key: "construction",
      icon: Anchor,
      label: "Konstruksjon",
      value: CONSTRUCTION_LABEL_NB[construction] ?? construction,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="@container mt-6">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 @md:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-col items-start gap-1 text-sm">
            <div className="flex min-w-0 items-center gap-1">
              <item.icon className="size-[15px] shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-xs text-muted-foreground">{item.label}</span>
            </div>
            <span className="min-w-0 font-medium leading-tight break-words">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Øvrig båtinfo under beskrivelsen — feltene som ikke hører hjemme i
 * nøkkelinfo-rutenettet: farge, bredde, dybde, vekt, motorfabrikant,
 * registreringsnummer og maksfart.
 */
export function BoatExtraInfo({ attributes }: { attributes: Attrs }) {
  const rows: { label: string; value: string }[] = [];
  const color = str(attributes.color);
  if (color) rows.push({ label: "Farge", value: color });
  const motorBrand = str(attributes.motor_brand);
  if (motorBrand) rows.push({ label: "Motorfabrikant", value: motorBrand });
  const maxSpeed = num(attributes.max_speed_knots);
  if (maxSpeed != null) rows.push({ label: "Maksfart", value: `${maxSpeed} knop` });
  const width = num(attributes.width_cm);
  if (width != null) rows.push({ label: "Bredde", value: `${width} cm` });
  const depth = num(attributes.depth_cm);
  if (depth != null) rows.push({ label: "Dybde", value: `${depth} cm` });
  const weight = num(attributes.weight_kg);
  if (weight != null) rows.push({ label: "Vekt", value: `${weight.toLocaleString("nb-NO")} kg` });
  const regNr = str(attributes.registration_number);
  if (regNr) rows.push({ label: "Registreringsnummer", value: regNr });

  if (rows.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl">Spesifikasjoner</h2>
      <dl className="mt-3 divide-y divide-border rounded-xl border border-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
