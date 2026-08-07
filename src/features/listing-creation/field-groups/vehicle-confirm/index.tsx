import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createVehicleBrand, createVehicleModel } from "@/lib/vehicle/vehicle-brands.functions";
import {
  VEHICLE_LEAF_SLUGS,
  VEHICLE_LEAF_SLUGS_MODEL_FREE_TEXT,
  type VehicleLeafSlug,
} from "@/lib/vehicle/vehicle-classification";
import {
  VehicleBrandField,
  VehicleModelWithClassField,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";
import type { VehicleBrandGroup } from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";
import {
  LEAF_LABELS_NB,
  AVGIFTSKODE_GRUPPE_LABELS_NB,
  FUEL_TYPE_OPTIONS,
  TRANSMISSION_OPTIONS,
  DRIVE_TYPE_OPTIONS,
  COLOR_OPTIONS,
} from "./constants";
import { parseIsoDate, specFromLookup, specOverridesFrom, type EditableSpec } from "./spec";
import { EuControlDateField } from "./eu-control-date-field";

export { DRIVE_TYPE_OPTIONS } from "./constants";

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
  const [brandOverride, setBrandOverride] = useState<string | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
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
        const modelIsFreeText = VEHICLE_LEAF_SLUGS_MODEL_FREE_TEXT.includes(
          selectedSlug as VehicleLeafSlug,
        );
        setModelName(modelIsFreeText ? null : (result.modelMatch?.name ?? null));
        if (vehicleLookupResult?.brand && !result.brandMatch) {
          if (!modelIsFreeText) setPendingModelName(vehicleLookupResult.model);
          setConfirmValue({ kind: "brand", name: vehicleLookupResult.brand });
        } else if (
          vehicleLookupResult?.model &&
          !modelIsFreeText &&
          !result.modelMatch &&
          result.brandMatch
        ) {
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

  /** Used when the desired brand isn't in the dropdown at all — adds it as a
   * new pending-approval brand, same as an auto-detected-but-unmatched value. */
  async function submitNewBrand() {
    const name = newBrandName.trim();
    if (!name || !categoryGroup) return;
    try {
      const brand = await createVehicleBrand({ data: { name, categoryGroup } });
      setBrandOverride(brand.name);
      setBrandName(brand.name);
      setBrandId(brand.id);
      setModelOverride(null);
      setModelName(null);
      showSuccessToast(`«${brand.name}» er sendt til godkjenning.`);
      setAddingBrand(false);
      setNewBrandName("");
    } catch {
      showErrorToast("Klarte ikke å legge til nytt merke. Prøv igjen.");
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
  const modelIsFreeText = VEHICLE_LEAF_SLUGS_MODEL_FREE_TEXT.includes(
    selectedSlug as VehicleLeafSlug,
  );
  /** Tillatt totalvekt og lengde er særlig relevant for bil, bobil,
   * campingvogn, tilhenger og de tyngre kjøretøykategoriene (nyttelast/
   * kapasitet og parkerings-/garasjeplass er kjøpsrelevant på en måte de
   * ikke er for MC/moped/ATV/snøscooter). */
  const showWeightAndLength =
    selectedSlug === "bil" ||
    isCamper ||
    selectedSlug === "tilhenger-leaf" ||
    selectedSlug === "lastebil-og-henger" ||
    selectedSlug === "buss-og-minibuss";

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
        {selectedSlug === "bil" && spec.avgiftskode_gruppe && (
          <p className="text-sm text-muted-foreground">
            Avgiftskode:{" "}
            <span className="font-medium text-foreground">
              {AVGIFTSKODE_GRUPPE_LABELS_NB[spec.avgiftskode_gruppe]}
            </span>{" "}
            (hentet fra Statens vegvesen, brukes til søk og filtrering)
          </p>
        )}
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
            Annonsens tittel blir:{" "}
            <span className="font-medium text-foreground">
              {[
                spec.year,
                brandOverride ?? brandName ?? lookup.brand,
                modelOverride ?? modelName ?? lookup.model,
              ]
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
                <VehicleBrandField
                  categoryGroup={categoryGroup ?? "bil"}
                  value={brandOverride ?? brandName ?? lookup.brand ?? undefined}
                  onChange={(v) => {
                    setBrandOverride(v ?? null);
                    // Modellisten avhenger av merket, så en tidligere valgt
                    // modell gir ikke lenger mening når merket endres.
                    setModelOverride(null);
                    setModelName(null);
                  }}
                />
                {addingBrand ? (
                  <div className="flex gap-2">
                    <Input
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      placeholder="F.eks. BYD"
                      className="flex-1"
                    />
                    <Button type="button" size="sm" onClick={() => void submitNewBrand()}>
                      Legg til
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAddingBrand(false)}
                    >
                      Avbryt
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingBrand(true)}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Fant du ikke merket? Legg til nytt
                  </button>
                )}
              </div>
              <div className="col-span-2 space-y-1">
                <VehicleModelWithClassField
                  categoryGroup={categoryGroup ?? "bil"}
                  brandName={brandOverride ?? brandName ?? undefined}
                  value={modelOverride ?? modelName ?? lookup.model ?? undefined}
                  onChange={(v) => setModelOverride(v ?? null)}
                  freeText={modelIsFreeText}
                />
                {!modelIsFreeText && addingModel ? (
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
                  !modelIsFreeText && (
                    <button
                      type="button"
                      onClick={() => setAddingModel(true)}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Fant du ikke modellen? Legg til ny
                    </button>
                  )
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
                <Select value={spec.color} onValueChange={(v) => setSpecField("color", v)}>
                  <SelectTrigger id="vc-color">
                    <SelectValue placeholder="Velg…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              {(brandOverride ?? brandName ?? lookup.brand) && (
                <>
                  <dt className="text-muted-foreground">Merke</dt>
                  <dd>{brandOverride ?? brandName ?? lookup.brand}</dd>
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
                    <dd>
                      {COLOR_OPTIONS.find((o) => o.value === spec.color)?.label ?? spec.color}
                    </dd>
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
            Vi klarer ikke å identifisere hjuldrift automatisk, så du må selv velge det som stemmer.
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
                  brandName: brandOverride ?? brandName ?? undefined,
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
              før det blir valgbart for andre. Stemmer det ikke, kan du velge riktig{" "}
              {confirmValue?.kind === "brand" ? "merke" : "modell"} selv fra listen vår i stedet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmValue(null);
                setPendingModelName(null);
                setEditing(true);
              }}
            >
              Nei, velg selv
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddValue}>Ja, stemmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
