import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { createVehicleBrand, createVehicleModel } from "@/lib/vehicle-brands.functions";
import { VEHICLE_LEAF_SLUGS, type VehicleLeafSlug } from "@/lib/vehicle-classification";
import { VehicleModelField } from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import type { VehicleBrandGroup } from "@/lib/category-filters";
import type { VehicleLookupResult } from "@/lib/vehicle-lookup.server";

import type { WizardSharedProps } from "../types";

const LEAF_LABELS_NB: Record<VehicleLeafSlug, string> = {
  personbil: "Personbil",
  varebil: "Varebil",
  bobil: "Bobil",
  campingvogn: "Campingvogn",
  motorsykkel: "Motorsykkel",
  "moped-og-scooter": "Moped/scooter",
  "atv-og-snoscooter": "ATV/snøscooter",
  "tilhenger-leaf": "Tilhenger",
};

const FUEL_TYPE_OPTIONS = [
  { value: "diesel", label: "Diesel" },
  { value: "bensin", label: "Bensin" },
  { value: "el", label: "Elektrisk" },
  { value: "hybrid", label: "Hybrid" },
];

const TRANSMISSION_OPTIONS = [
  { value: "manuell", label: "Manuell" },
  { value: "automat", label: "Automat" },
];

const DRIVE_TYPE_OPTIONS = [
  { value: "4x4", label: "Firehjulsdrift" },
  { value: "bakhjul", label: "Bakhjulsdrift" },
  { value: "forhjul", label: "Forhjulsdrift" },
];

/** `next_eu_control` is stored/submitted as an ISO date (`yyyy-MM-dd`) —
 * matching the format SVV's `kontrollfrist` already comes in as — but shown
 * to the user as a calendar-picked `dd.MM.yyyy`, same field used by every
 * vehicle leaf (not a trailer-specific control). */
function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** `mode="future"` (default) is for dates like EU-kontroll that must lie
 * ahead of today; `mode="past"` is for dates like førstegangsregistrering
 * that must lie behind it. Both share the same ISO-in/dd.MM.yyyy-out
 * behavior — only which half of the calendar is selectable differs. */
function EuControlDateField({
  id,
  value,
  onChange,
  mode = "future",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  mode?: "future" | "past";
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseIsoDate(value);
  const today = startOfToday();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          className="w-full justify-start font-normal"
        >
          <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
          {selectedDate ? format(selectedDate, "dd.MM.yyyy") : "Velg dato"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selectedDate}
          disabled={mode === "future" ? { before: today } : { after: today }}
          startMonth={mode === "future" ? today : new Date(1970, 0)}
          endMonth={mode === "future" ? new Date(new Date().getFullYear() + 4, 11) : today}
          onSelect={(date) => {
            if (date) onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The subset of vehicle-confirm's fields that are also `category_filters`
 * for vehicle leaves — editable here so they're never asked again in the
 * later category-attributes step (see VEHICLE_LOOKUP_FILTER_KEYS). */
type EditableSpec = {
  year: string;
  fuel_type: string;
  transmission: string;
  drive_type: string;
  weight_kg: string;
  /** Tillatt totalvekt — kun relevant for varebil/bobil/campingvogn/tilhenger
   * (se `showWeightAndLength` under). */
  max_total_weight_kg: string;
  /** Lengde i meter — samme kategorier som over. */
  length_m: string;
  power_hk: string;
  tow_hitch: boolean;
  max_tow_weight_kg: string;
  seats: string;
  color: string;
  next_eu_control: string;
  eu_control_exempt: boolean | null;
  /** Antall soveplasser — kun relevant for bobil/campingvogn (se `isCamper`
   * under). Statens vegvesens Enkeltoppslag-API har ikke dette feltet i det
   * hele tatt (verifisert mot det reelle OpenAPI-skjemaet), så `lookup.
   * sleeping_places` er alltid `null` — dette er derfor et rent manuelt felt,
   * ikke en SVV-verdi brukeren kan korrigere. */
  sleeping_places: string;
  imported_used: boolean | null;
  first_registration_date: string;
  cylinders: string;
  engine_displacement_cc: string;
  engine_code: string;
};

function specFromLookup(lookup: VehicleLookupResult | null): EditableSpec {
  return {
    year: lookup?.year != null ? String(lookup.year) : "",
    fuel_type: lookup?.fuel_type ?? "",
    transmission: lookup?.transmission ?? "",
    drive_type: lookup?.drive_type ?? "",
    weight_kg: lookup?.weight_kg != null ? String(lookup.weight_kg) : "",
    max_total_weight_kg:
      lookup?.max_total_weight_kg != null ? String(lookup.max_total_weight_kg) : "",
    length_m: lookup?.length_m != null ? String(lookup.length_m) : "",
    power_hk: lookup?.power_hk != null ? String(lookup.power_hk) : "",
    tow_hitch: lookup?.tow_hitch ?? false,
    max_tow_weight_kg: lookup?.max_tow_weight_kg != null ? String(lookup.max_tow_weight_kg) : "",
    seats: lookup?.seats != null ? String(lookup.seats) : "",
    color: lookup?.color ?? "",
    next_eu_control: lookup?.next_eu_control ?? "",
    // Statens vegvesen-oppslaget inneholder ikke pålitelig informasjon om
    // Tempo 100-registrering, så dette kan aldri utledes automatisk — brukeren
    // må alltid svare eksplisitt (se spørsmålet under datakortet i UI-en).
    eu_control_exempt: null,
    sleeping_places: lookup?.sleeping_places != null ? String(lookup.sleeping_places) : "",
    imported_used: lookup?.imported_used ?? null,
    first_registration_date: lookup?.first_registration_date ?? "",
    cylinders: lookup?.cylinders != null ? String(lookup.cylinders) : "",
    engine_displacement_cc:
      lookup?.engine_displacement_cc != null ? String(lookup.engine_displacement_cc) : "",
    engine_code: lookup?.engine_code ?? "",
  };
}

function specOverridesFrom(spec: EditableSpec) {
  return {
    year: spec.year.trim() ? Number(spec.year) : undefined,
    fuel_type: spec.fuel_type || undefined,
    transmission: spec.transmission || undefined,
    drive_type: spec.drive_type || undefined,
    weight_kg: spec.weight_kg.trim() ? Number(spec.weight_kg) : undefined,
    max_total_weight_kg: spec.max_total_weight_kg.trim()
      ? Number(spec.max_total_weight_kg)
      : undefined,
    length_m: spec.length_m.trim() ? Number(spec.length_m) : undefined,
    power_hk: spec.power_hk.trim() ? Number(spec.power_hk) : undefined,
    tow_hitch: spec.tow_hitch,
    max_tow_weight_kg: spec.max_tow_weight_kg.trim() ? Number(spec.max_tow_weight_kg) : undefined,
    seats: spec.seats.trim() ? Number(spec.seats) : undefined,
    color: spec.color || undefined,
    next_eu_control: spec.next_eu_control || undefined,
    eu_control_exempt: spec.eu_control_exempt ?? undefined,
    sleeping_places: spec.sleeping_places.trim() ? Number(spec.sleeping_places) : undefined,
    imported_used: spec.imported_used ?? undefined,
    first_registration_date: spec.first_registration_date || undefined,
    cylinders: spec.cylinders.trim() ? Number(spec.cylinders) : undefined,
    engine_displacement_cc: spec.engine_displacement_cc.trim()
      ? Number(spec.engine_displacement_cc)
      : undefined,
    engine_code: spec.engine_code || undefined,
  };
}

/**
 * Dedicated confirmation step for the vehicle-first flow: shown only after a
 * successful Statens Vegvesen lookup. Displays the auto-detected vehicle
 * type (editable, in case classification is missing/low-confidence or the
 * user disagrees) plus the full fetched data set, and requires an explicit
 * "Bekreft og fortsett" before the category/attributes are committed.
 *
 * Modell (a dropdown of approved models for the matched brand, same as
 * category-attributes' brand/model fields, plus a "legg til ny modell"
 * escape hatch for values not in the list) and every other SVV-fetched spec
 * field (year/drivstoff/girkasse/hjuldrift/vekt/effekt/hengerfeste/seter/
 * farge/EU-kontroll/bruktimport/førstegangsregistrering/sylindre/slagvolum/
 * motorkode) are editable directly here via "Rediger opplysninger" — SVV
 * has no field for trim/variant badges (e.g. "N", "GTI"), so a manual model
 * correction is the only way to get those into the listing. "Rediger
 * opplysninger" is reserved for *correcting* SVV-fetched data, though — antall
 * soveplasser (bobil/campingvogn) is never populated by SVV at all (the field
 * doesn't exist in Enkeltoppslag's schema), so it's a required, always-visible
 * input of its own further down, not tucked behind that toggle where a seller
 * has no reason to think to look for a field we never claimed to have fetched.
 * (`classification_code`/`avgiftsklasse_*`/`body_type_hint` are the one
 * exception — those only drive internal category classification and are
 * never written to the listing's attributes, so there's nothing an edit here
 * could change.) The spec fields are hidden from the later category-attributes
 * ("Detaljer") step (see VEHICLE_LOOKUP_FILTER_KEYS) so the user is never
 * asked to fill them in twice. If the user doesn't choose to edit, nothing
 * here forces them to.
 *
 * Also resolves the SVV brand/model against approved vehicle_brands/
 * vehicle_models as soon as a vehicle type is selected, and — if unmatched —
 * asks the user to confirm adding it as a new (pending-approval) value,
 * mirroring the old inline vehicle-lookup module's behavior but as a visible
 * step here instead of firing silently.
 */
export function VehicleConfirm({
  categories,
  vehicleLookupResult,
  vehicleClassification,
  vehiclePreviousClassificationMismatch,
  vehicleConfirmFooterSlot,
  matchVehicleBrandForLeaf,
  confirmVehicleData,
}: WizardSharedProps) {
  const detectedSlug = vehicleClassification?.slug ?? null;
  const [selectedSlug, setSelectedSlug] = useState<VehicleLeafSlug | null>(detectedSlug);
  const [matching, setMatching] = useState(false);
  const [categoryGroup, setCategoryGroup] = useState<VehicleBrandGroup | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [confirmValue, setConfirmValue] = useState<{
    kind: "brand" | "model";
    name: string;
  } | null>(null);
  const [pendingModelName, setPendingModelName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [spec, setSpec] = useState<EditableSpec>(() => specFromLookup(vehicleLookupResult));
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  /** Fixed at mount from the raw lookup, not `spec.drive_type` — so the
   * "velg selv" field stays visible once the user has answered it instead of
   * vanishing the instant they pick a value (which read as the choice not
   * having registered). Declared here (before the `!vehicleLookupResult`
   * early return below) so hook order stays stable across renders. */
  const [driveTypeWasAmbiguous] = useState(!vehicleLookupResult?.drive_type);

  const leafBySlug = new Map(
    categories
      .filter((c) => c.slug && VEHICLE_LEAF_SLUGS.includes(c.slug as VehicleLeafSlug))
      .map((c) => [c.slug, c]),
  );

  useEffect(() => {
    if (!selectedSlug) return;
    const leaf = leafBySlug.get(selectedSlug);
    if (!leaf) return;
    let cancelled = false;
    setMatching(true);
    void matchVehicleBrandForLeaf(leaf.id)
      .then((result) => {
        if (cancelled || !result) return;
        setCategoryGroup(result.categoryGroup);
        setBrandName(result.brandMatch?.name ?? null);
        setBrandId(result.brandMatch?.id ?? null);
        setModelName(result.modelMatch?.name ?? null);
        if (vehicleLookupResult?.brand && !result.brandMatch) {
          setPendingModelName(vehicleLookupResult.model);
          setConfirmValue({ kind: "brand", name: vehicleLookupResult.brand });
        } else if (vehicleLookupResult?.model && !result.modelMatch && result.brandMatch) {
          setConfirmValue({ kind: "model", name: vehicleLookupResult.model });
        }
      })
      .finally(() => {
        if (!cancelled) setMatching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  async function confirmAddValue() {
    if (!confirmValue || !categoryGroup) return;
    let chainToModel: string | null = null;
    try {
      if (confirmValue.kind === "brand") {
        const brand = await createVehicleBrand({
          data: { name: confirmValue.name, categoryGroup },
        });
        setBrandName(brand.name);
        setBrandId(brand.id);
        showSuccessToast(`«${brand.name}» er sendt til godkjenning.`);
        if (pendingModelName) chainToModel = pendingModelName;
      } else if (!brandId) {
        showErrorToast("Velg merke før du legger til modell.");
      } else {
        const model = await createVehicleModel({ data: { brandId, name: confirmValue.name } });
        setModelName(model.name);
        showSuccessToast(`«${model.name}» er sendt til godkjenning.`);
      }
    } catch {
      showErrorToast("Klarte ikke å legge til ny verdi. Prøv igjen.");
    } finally {
      if (chainToModel) {
        setConfirmValue({ kind: "model", name: chainToModel });
        setPendingModelName(null);
      } else {
        setConfirmValue(null);
        setPendingModelName(null);
      }
    }
  }

  /** Used when the desired model isn't in the dropdown at all (e.g. a trim
   * variant like "IONIQ 5 N" that SVV has no data for) — adds it as a new
   * pending-approval model, same as an auto-detected-but-unmatched value. */
  async function submitNewModel() {
    const name = newModelName.trim();
    if (!name) return;
    if (!brandId) {
      showErrorToast("Velg merke før du legger til modell.");
      return;
    }
    try {
      const model = await createVehicleModel({ data: { brandId, name } });
      setModelName(model.name);
      setModelOverride(null);
      showSuccessToast(`«${model.name}» er sendt til godkjenning.`);
      setAddingModel(false);
      setNewModelName("");
    } catch {
      showErrorToast("Klarte ikke å legge til ny modell. Prøv igjen.");
    }
  }

  if (!vehicleLookupResult) return null;
  const lookup = vehicleLookupResult;
  const isTrailer = selectedSlug === "tilhenger-leaf";
  const isCamper = selectedSlug === "bobil" || selectedSlug === "campingvogn";
  /** Tillatt totalvekt og lengde er særlig relevant for varebil, bobil,
   * campingvogn og tilhenger (nyttelast/kapasitet og parkerings-/garasjeplass
   * er kjøpsrelevant på en måte de ikke er for en vanlig personbil/MC). */
  const showWeightAndLength =
    selectedSlug === "varebil" || isCamper || selectedSlug === "tilhenger-leaf";

  function setSpecField<K extends keyof EditableSpec>(key: K, value: EditableSpec[K]) {
    setSpec((s) => ({ ...s, [key]: value }));
  }

  return (
    <section className="space-y-3">
      <div className="space-y-2">
        <Label>Kjøretøytype</Label>
        {detectedSlug && vehicleClassification?.confidence === "high" ? (
          <p className="text-sm text-muted-foreground">
            Vi har funnet ut at dette er en{" "}
            <span className="font-medium text-foreground">{LEAF_LABELS_NB[detectedSlug]}</span>.
            Stemmer dette?
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Vi klarte ikke å avgjøre kjøretøytype automatisk. Velg riktig type under.
          </p>
        )}
        <div role="radiogroup" aria-label="Kjøretøytype" className="flex flex-wrap gap-2">
          {VEHICLE_LEAF_SLUGS.filter((slug) => leafBySlug.has(slug)).map((slug) => (
            <button
              key={slug}
              type="button"
              role="radio"
              aria-checked={selectedSlug === slug}
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

      {vehiclePreviousClassificationMismatch && (
        <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Sist du slo opp dette registreringsnummeret fikk du{" "}
          <span className="font-medium">
            {vehiclePreviousClassificationMismatch.slug &&
            vehiclePreviousClassificationMismatch.slug in LEAF_LABELS_NB
              ? LEAF_LABELS_NB[vehiclePreviousClassificationMismatch.slug as VehicleLeafSlug]
              : "en annen kjøretøytype"}
          </span>{" "}
          — dette kan skje ved eierskifte av personlige kjennemerker. Sjekk at kjøretøytypen under
          stemmer med kjøretøyet du selger nå.
        </div>
      )}

      <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Opplysningene under er hentet fra Statens vegvesen. Du kan endre feltene under dersom noe er
        feil, men husk at du etter forbrukerkjøpsloven er ansvarlig for at opplysningene om
        kjøretøyet du oppgir i annonsen er korrekte. Rett kun det som faktisk er feil.
      </div>

      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">Tekniske data</p>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            {editing ? "Ferdig med å redigere" : "Rediger opplysninger"}
          </button>
        </div>
        {(spec.year || lookup.brand || lookup.model) && (
          <p className="mt-1 text-muted-foreground">
            Tittel blir:{" "}
            <span className="font-medium text-foreground">
              {[spec.year, brandName ?? lookup.brand, modelOverride ?? modelName ?? lookup.model]
                .filter(Boolean)
                .join(" ")}
            </span>
          </p>
        )}
        <p role="status" aria-live="polite" className="mt-1 text-xs text-muted-foreground">
          {matching && "Sjekker merke/modell…"}
        </p>

        {editing ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <VehicleModelField
                  categoryGroup={categoryGroup ?? "bil"}
                  brandName={brandName ?? undefined}
                  value={modelOverride ?? modelName ?? lookup.model ?? undefined}
                  onChange={(v) => setModelOverride(v ?? null)}
                />
                {addingModel ? (
                  <div className="flex gap-2">
                    <Input
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      placeholder="F.eks. IONIQ 5 N"
                      className="flex-1"
                    />
                    <Button type="button" size="sm" onClick={() => void submitNewModel()}>
                      Legg til
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAddingModel(false)}
                    >
                      Avbryt
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingModel(true)}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Fant du ikke modellen? Legg til ny
                  </button>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="vc-year">Årsmodell</Label>
                <Input
                  id="vc-year"
                  type="number"
                  value={spec.year}
                  onChange={(e) => setSpecField("year", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vc-weight">Egenvekt (kg)</Label>
                <Input
                  id="vc-weight"
                  type="number"
                  value={spec.weight_kg}
                  onChange={(e) => setSpecField("weight_kg", e.target.value)}
                />
              </div>
              {showWeightAndLength && (
                <div className="space-y-1">
                  <Label htmlFor="vc-max-total-weight">Tillatt totalvekt (kg)</Label>
                  <Input
                    id="vc-max-total-weight"
                    type="number"
                    value={spec.max_total_weight_kg}
                    onChange={(e) => setSpecField("max_total_weight_kg", e.target.value)}
                  />
                </div>
              )}
              {showWeightAndLength && (
                <div className="space-y-1">
                  <Label htmlFor="vc-length">Lengde (m)</Label>
                  <Input
                    id="vc-length"
                    type="number"
                    step="0.01"
                    value={spec.length_m}
                    onChange={(e) => setSpecField("length_m", e.target.value)}
                  />
                </div>
              )}
              {!isTrailer && (
                <div className="space-y-1">
                  <Label>Drivstoff</Label>
                  <Select
                    value={spec.fuel_type}
                    onValueChange={(v) => setSpecField("fuel_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Velg…" />
                    </SelectTrigger>
                    <SelectContent>
                      {FUEL_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!isTrailer && (
                <div className="space-y-1">
                  <Label>Girkasse</Label>
                  <Select
                    value={spec.transmission}
                    onValueChange={(v) => setSpecField("transmission", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Velg…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSMISSION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!isTrailer && (
                <div className="space-y-1">
                  <Label htmlFor="vc-power">Effekt (hk)</Label>
                  <Input
                    id="vc-power"
                    type="number"
                    value={spec.power_hk}
                    onChange={(e) => setSpecField("power_hk", e.target.value)}
                  />
                </div>
              )}
              {!isTrailer && (
                <div className="space-y-1">
                  <Label htmlFor="vc-seats">Antall seter</Label>
                  <Input
                    id="vc-seats"
                    type="number"
                    value={spec.seats}
                    onChange={(e) => setSpecField("seats", e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="vc-color">Farge</Label>
                <Input
                  id="vc-color"
                  value={spec.color}
                  onChange={(e) => setSpecField("color", e.target.value)}
                />
              </div>
              {!isTrailer && (
                <div className="space-y-1">
                  <Label htmlFor="vc-eu-control">Neste EU-kontroll</Label>
                  <EuControlDateField
                    id="vc-eu-control"
                    value={spec.next_eu_control}
                    onChange={(v) => setSpecField("next_eu_control", v)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="vc-first-reg">Førstegangsregistrering</Label>
                <EuControlDateField
                  id="vc-first-reg"
                  mode="past"
                  value={spec.first_registration_date}
                  onChange={(v) => setSpecField("first_registration_date", v)}
                />
              </div>
              {!isTrailer && spec.fuel_type !== "el" && (
                <div className="space-y-1">
                  <Label htmlFor="vc-cylinders">Antall sylindre</Label>
                  <Input
                    id="vc-cylinders"
                    type="number"
                    value={spec.cylinders}
                    onChange={(e) => setSpecField("cylinders", e.target.value)}
                  />
                </div>
              )}
              {!isTrailer && spec.fuel_type !== "el" && (
                <div className="space-y-1">
                  <Label htmlFor="vc-displacement">Slagvolum (cc)</Label>
                  <Input
                    id="vc-displacement"
                    type="number"
                    value={spec.engine_displacement_cc}
                    onChange={(e) => setSpecField("engine_displacement_cc", e.target.value)}
                  />
                </div>
              )}
              {!isTrailer && spec.fuel_type !== "el" && (
                <div className="space-y-1">
                  <Label htmlFor="vc-engine-code">Motorkode</Label>
                  <Input
                    id="vc-engine-code"
                    value={spec.engine_code}
                    onChange={(e) => setSpecField("engine_code", e.target.value)}
                  />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={spec.imported_used ?? false}
                onCheckedChange={(c) => setSpecField("imported_used", c === true)}
              />
              Bruktimportert
            </label>
            {!isTrailer && (
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={spec.tow_hitch}
                    onCheckedChange={(c) => setSpecField("tow_hitch", c === true)}
                  />
                  Hengerfeste
                </label>
                {spec.tow_hitch && (
                  <div className="max-w-[220px] space-y-1">
                    <Label htmlFor="vc-max-tow-weight">Maks tilhengervekt (kg)</Label>
                    <Input
                      id="vc-max-tow-weight"
                      type="number"
                      value={spec.max_tow_weight_kg}
                      onChange={(e) => setSpecField("max_tow_weight_kg", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              {(brandName ?? lookup.brand) && (
                <>
                  <dt className="text-muted-foreground">Merke</dt>
                  <dd>{brandName ?? lookup.brand}</dd>
                </>
              )}
              {(modelOverride ?? modelName ?? lookup.model) && (
                <>
                  <dt className="text-muted-foreground">Modell</dt>
                  <dd>{modelOverride ?? modelName ?? lookup.model}</dd>
                </>
              )}
              {spec.year && (
                <>
                  <dt className="text-muted-foreground">Årsmodell</dt>
                  <dd>{spec.year}</dd>
                </>
              )}
              {spec.fuel_type && (
                <>
                  <dt className="text-muted-foreground">Drivstoff</dt>
                  <dd>{FUEL_TYPE_OPTIONS.find((o) => o.value === spec.fuel_type)?.label}</dd>
                </>
              )}
              {spec.weight_kg && (
                <>
                  <dt className="text-muted-foreground">Egenvekt</dt>
                  <dd>{spec.weight_kg} kg</dd>
                </>
              )}
              {showWeightAndLength && spec.max_total_weight_kg && (
                <>
                  <dt className="text-muted-foreground">Tillatt totalvekt</dt>
                  <dd>{spec.max_total_weight_kg} kg</dd>
                </>
              )}
              {showWeightAndLength && spec.length_m && (
                <>
                  <dt className="text-muted-foreground">Lengde</dt>
                  <dd>{spec.length_m} m</dd>
                </>
              )}
            </dl>

            {/* Secondary fields collapsed by default — keeps the confirm
                step from being one long scroll on small/native screens;
                still all visible via "Vis flere detaljer" (or the "Rediger
                opplysninger" toggle above, for the editable subset). */}
            <details className="mt-2 group">
              <summary className="cursor-pointer text-xs text-primary select-none">
                <span className="group-open:hidden">Vis flere detaljer</span>
                <span className="hidden group-open:inline">Skjul flere detaljer</span>
              </summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {lookup.body_type_hint && (
                  <>
                    <dt className="text-muted-foreground">Karosseri</dt>
                    <dd>{lookup.body_type_hint}</dd>
                  </>
                )}
                {!isTrailer && spec.power_hk && (
                  <>
                    <dt className="text-muted-foreground">Effekt</dt>
                    <dd>{spec.power_hk} hk</dd>
                  </>
                )}
                {!isTrailer && spec.drive_type && (
                  <>
                    <dt className="text-muted-foreground">Hjuldrift</dt>
                    <dd>{DRIVE_TYPE_OPTIONS.find((o) => o.value === spec.drive_type)?.label}</dd>
                  </>
                )}
                {!isTrailer && spec.transmission && (
                  <>
                    <dt className="text-muted-foreground">Girkasse</dt>
                    <dd>
                      {TRANSMISSION_OPTIONS.find((o) => o.value === spec.transmission)?.label}
                    </dd>
                  </>
                )}
                {!isTrailer && (
                  <>
                    <dt className="text-muted-foreground">Hengerfeste</dt>
                    <dd>
                      {spec.tow_hitch
                        ? `Ja${spec.max_tow_weight_kg ? ` (${spec.max_tow_weight_kg} kg)` : ""}`
                        : "Nei"}
                    </dd>
                  </>
                )}
                {!isTrailer && spec.seats && (
                  <>
                    <dt className="text-muted-foreground">Antall seter</dt>
                    <dd>{spec.seats}</dd>
                  </>
                )}
                {isTrailer && spec.eu_control_exempt != null && (
                  <>
                    <dt className="text-muted-foreground">Fritatt for EU-kontroll</dt>
                    <dd>{spec.eu_control_exempt ? "Ja" : "Nei"}</dd>
                  </>
                )}
                {spec.imported_used != null && (
                  <>
                    <dt className="text-muted-foreground">Bruktimportert</dt>
                    <dd>{spec.imported_used ? "Ja" : "Nei"}</dd>
                  </>
                )}
                {spec.first_registration_date && (
                  <>
                    <dt className="text-muted-foreground">Førstegangsregistrering</dt>
                    <dd>
                      {(() => {
                        const d = parseIsoDate(spec.first_registration_date);
                        return d ? format(d, "dd.MM.yyyy") : spec.first_registration_date;
                      })()}
                    </dd>
                  </>
                )}
                {spec.color && (
                  <>
                    <dt className="text-muted-foreground">Farge</dt>
                    <dd>{spec.color}</dd>
                  </>
                )}
                {spec.next_eu_control && (
                  <>
                    <dt className="text-muted-foreground">Neste EU-kontroll</dt>
                    <dd>
                      {(() => {
                        const d = parseIsoDate(spec.next_eu_control);
                        return d ? format(d, "dd.MM.yyyy") : spec.next_eu_control;
                      })()}
                    </dd>
                  </>
                )}
                {spec.fuel_type !== "el" && spec.cylinders && (
                  <>
                    <dt className="text-muted-foreground">Antall sylindre</dt>
                    <dd>{spec.cylinders}</dd>
                  </>
                )}
                {spec.fuel_type !== "el" && spec.engine_displacement_cc && (
                  <>
                    <dt className="text-muted-foreground">Slagvolum</dt>
                    <dd>{spec.engine_displacement_cc} cc</dd>
                  </>
                )}
                {spec.fuel_type !== "el" && spec.engine_code && (
                  <>
                    <dt className="text-muted-foreground">Motorkode</dt>
                    <dd>{spec.engine_code}</dd>
                  </>
                )}
              </dl>
            </details>
          </>
        )}
      </div>

      {!isTrailer && driveTypeWasAmbiguous && (
        <div className="space-y-1 rounded-md border border-border p-3">
          <Label htmlFor="vc-drive-type">Hjuldrift</Label>
          <p className="text-xs text-muted-foreground">
            Statens vegvesen gir oss ikke nok informasjon til å avgjøre om kjøretøyet trekker på
            for- eller bakaksel, så du må velge selv.
          </p>
          <Select value={spec.drive_type} onValueChange={(v) => setSpecField("drive_type", v)}>
            <SelectTrigger id="vc-drive-type" className="max-w-[220px]">
              <SelectValue placeholder="Velg…" />
            </SelectTrigger>
            <SelectContent>
              {DRIVE_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isCamper && (
        <div className="space-y-1 rounded-md border border-border p-3">
          <Label htmlFor="vc-sleeping-places">Antall soveplasser</Label>
          <p className="text-xs text-muted-foreground">
            Statens vegvesen har ikke denne opplysningen, så du må fylle den inn selv — den er
            relevant for kjøpere og vises på annonsen.
          </p>
          <Input
            id="vc-sleeping-places"
            type="number"
            min={0}
            className="max-w-[140px]"
            value={spec.sleeping_places}
            onChange={(e) => setSpecField("sleeping_places", e.target.value)}
          />
        </div>
      )}

      {isTrailer && (
        <div className="space-y-1 rounded-md border border-border p-3">
          <Label>Er hengeren fritatt for periodisk kjøretøykontroll (EU-kontroll)?</Label>
          <p className="text-xs text-muted-foreground">
            Dette henter vi ikke fra Statens vegvesen, så du må svare selv. Tilhengere med tillatt
            totalvekt t.o.m. 3500 kg som ikke er registrert som Tempo 100 er fritatt for kontroll.
            Tempo 100-tilhengere t.o.m. 3500 kg må kontrolleres hvert 2. år fra de er 4 år gamle,
            mens tyngre tilhengere (over 3500 kg) må kontrolleres årlig uansett.
          </p>
          <div role="radiogroup" aria-label="Fritatt for EU-kontroll" className="flex gap-2 pt-1">
            <button
              type="button"
              role="radio"
              aria-checked={spec.eu_control_exempt === true}
              onClick={() => setSpecField("eu_control_exempt", true)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                spec.eu_control_exempt === true
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-primary/40"
              }`}
            >
              Ja, fritatt
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={spec.eu_control_exempt === false}
              onClick={() => setSpecField("eu_control_exempt", false)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                spec.eu_control_exempt === false
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-primary/40"
              }`}
            >
              Nei, kontrollpliktig
            </button>
          </div>
          {spec.eu_control_exempt === false && (
            <div className="max-w-[220px] space-y-1 pt-2">
              <Label htmlFor="vc-eu-control">Neste EU-kontroll</Label>
              <EuControlDateField
                id="vc-eu-control"
                value={spec.next_eu_control}
                onChange={(v) => setSpecField("next_eu_control", v)}
              />
            </div>
          )}
        </div>
      )}

      {vehicleConfirmFooterSlot &&
        createPortal(
          <Button
            type="button"
            disabled={
              !selectedSlug ||
              matching ||
              !!confirmValue ||
              (isTrailer && spec.eu_control_exempt === null) ||
              (!isTrailer && !spec.drive_type)
            }
            onClick={() => {
              const leaf = selectedSlug ? leafBySlug.get(selectedSlug) : null;
              if (leaf)
                void confirmVehicleData(leaf.id, {
                  brandName: brandName ?? undefined,
                  modelName: modelOverride ?? modelName ?? undefined,
                  specOverrides: specOverridesFrom(spec),
                });
            }}
          >
            Bekreft og fortsett
          </Button>,
          vehicleConfirmFooterSlot,
        )}

      <AlertDialog open={!!confirmValue} onOpenChange={(open) => !open && setConfirmValue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Vi fant ikke «{confirmValue?.name}» i vår{" "}
              {confirmValue?.kind === "brand" ? "merke" : "modell"}-liste
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stemmer dette? Vi bruker det på annonsen din nå, og sender det til intern godkjenning
              før det blir valgbart for andre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmValue(null)}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddValue}>Legg til</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
