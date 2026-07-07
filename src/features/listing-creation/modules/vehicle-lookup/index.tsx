import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAllCategoryFilters, type AttributeMap } from "@/components/attribute-fields";
import { vehicleCategoryGroupFor, type CategoryNode } from "@/lib/category-filters";
import { lookupVehicleByRegNumber } from "@/lib/vehicle-lookup.functions";
import { createVehicleBrand, createVehicleModel } from "@/lib/vehicle-brands.functions";

import type { CategoryModule, CategoryModuleProps } from "../types";
import { MODULE_VALIDATORS } from "../validators";

/**
 * Registreringsstatus + Statens vegvesen-kjøretøyoppslag. Vises kun for
 * kategorier som har koblede merke/modell-felt (brand_select), dvs.
 * kjøretøy-kategoriene. Oppslag blokkerer aldri publisering — bruker kan
 * alltid fylle ut merke/modell manuelt fra nedtrekksmenyene i stedet.
 */
export function VehicleLookupPanel({
  categoryId,
  categories,
  value,
  onChange,
}: CategoryModuleProps) {
  const { data: allFilters } = useAllCategoryFilters();

  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const categoryGroup = useMemo(
    () => vehicleCategoryGroupFor(categoryId, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );

  const [regNr, setRegNr] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    brand: string | null;
    model: string | null;
    year: number | null;
    fuel_type: string | null;
    weight_kg: number | null;
    power_hk: number | null;
    drive_type: string | null;
    tow_hitch: boolean | null;
    max_tow_weight_kg: number | null;
    seats: number | null;
    imported_used: boolean | null;
    first_registration_date: string | null;
    color: string | null;
    transmission: string | null;
    next_eu_control: string | null;
    cylinders: number | null;
    engine_displacement_cc: number | null;
    engine_code: string | null;
    sleeping_places: number | null;
  } | null>(null);
  const [confirmValue, setConfirmValue] = useState<{
    kind: "brand" | "model";
    name: string;
  } | null>(null);
  const [pendingModelName, setPendingModelName] = useState<string | null>(null);
  const [pendingBrandId, setPendingBrandId] = useState<string | null>(null);

  if (!categoryGroup) return null;

  const isRegistered = value.is_registered === true;

  function setIsRegistered(v: boolean) {
    const next = { ...value };
    if (v) next.is_registered = true;
    else {
      delete next.is_registered;
      delete next.registration_number;
    }
    onChange(next);
    setSummary(null);
    setLookupError(null);
  }

  async function runLookup() {
    if (!regNr.trim() || !categoryGroup) return;
    setLoading(true);
    setLookupError(null);
    try {
      const { lookup, brandMatch, modelMatch } = await lookupVehicleByRegNumber({
        data: { registrationNumber: regNr, categoryGroup },
      });
      const next: AttributeMap = {
        ...value,
        is_registered: true,
        registration_number: lookup.registrationNumber,
        vehicle_lookup: JSON.stringify(lookup),
      };
      if (lookup.year) next.year = lookup.year;
      if (lookup.fuel_type) next.fuel_type = lookup.fuel_type;
      if (lookup.weight_kg != null) next.weight_kg = lookup.weight_kg;
      if (lookup.transmission) next.transmission = lookup.transmission;
      if (lookup.color) next.color = lookup.color;
      if (lookup.next_eu_control) next.next_eu_control = lookup.next_eu_control;
      if (lookup.power_hk != null) next.power_hk = lookup.power_hk;
      if (lookup.drive_type) next.drive_type = lookup.drive_type;
      if (lookup.tow_hitch != null) next.tow_hitch = lookup.tow_hitch;
      if (lookup.max_tow_weight_kg != null) next.max_tow_weight_kg = lookup.max_tow_weight_kg;
      if (lookup.seats != null) next.seats = lookup.seats;
      if (lookup.imported_used != null) next.imported_used = lookup.imported_used;
      if (lookup.first_registration_date)
        next.first_registration_date = lookup.first_registration_date;
      if (lookup.cylinders != null) next.cylinders = lookup.cylinders;
      if (lookup.engine_displacement_cc != null)
        next.engine_displacement_cc = lookup.engine_displacement_cc;
      if (lookup.engine_code) next.engine_code = lookup.engine_code;
      if (lookup.sleeping_places != null) next.sleeping_places = lookup.sleeping_places;

      if (brandMatch) next.brand = brandMatch.name;
      if (modelMatch) next.model = modelMatch.name;
      onChange(next);
      setSummary({
        brand: lookup.brand,
        model: lookup.model,
        year: lookup.year,
        fuel_type: lookup.fuel_type,
        weight_kg: lookup.weight_kg,
        power_hk: lookup.power_hk,
        drive_type: lookup.drive_type,
        tow_hitch: lookup.tow_hitch,
        max_tow_weight_kg: lookup.max_tow_weight_kg,
        seats: lookup.seats,
        imported_used: lookup.imported_used,
        first_registration_date: lookup.first_registration_date,
        color: lookup.color,
        transmission: lookup.transmission,
        next_eu_control: lookup.next_eu_control,
        cylinders: lookup.cylinders,
        engine_displacement_cc: lookup.engine_displacement_cc,
        engine_code: lookup.engine_code,
        sleeping_places: lookup.sleeping_places,
      });

      if (lookup.brand && !brandMatch) {
        setPendingModelName(lookup.model);
        setPendingBrandId(null);
        setConfirmValue({ kind: "brand", name: lookup.brand });
      } else if (lookup.model && !modelMatch && brandMatch) {
        setPendingBrandId(brandMatch.id);
        setConfirmValue({ kind: "model", name: lookup.model });
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Kjøretøyoppslag feilet.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmAddValue() {
    if (!confirmValue || !categoryGroup) return;
    let chainToModel: string | null = null;
    try {
      if (confirmValue.kind === "brand") {
        const brand = await createVehicleBrand({
          data: { name: confirmValue.name, categoryGroup },
        });
        onChange({ ...value, brand: brand.name });
        showSuccessToast(`«${brand.name}» er sendt til admin for godkjenning.`);
        // If the lookup also returned an unmatched model, offer to add it next.
        if (pendingModelName) {
          chainToModel = pendingModelName;
          setPendingBrandId(brand.id);
        }
      } else if (!pendingBrandId) {
        showErrorToast("Velg merke før du legger til modell.");
      } else {
        const model = await createVehicleModel({
          data: { brandId: pendingBrandId, name: confirmValue.name },
        });
        onChange({ ...value, model: model.name });
        showSuccessToast(`«${model.name}» er sendt til admin for godkjenning.`);
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
        setPendingBrandId(null);
      }
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={isRegistered} onCheckedChange={(c) => setIsRegistered(c === true)} />
        Kjøretøyet er registrert
      </label>

      {isRegistered && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Registreringsnummer</Label>
            <div className="flex gap-2">
              <Input
                value={regNr}
                onChange={(e) => setRegNr(e.target.value.toUpperCase())}
                placeholder="F.eks. AB12345"
                className="max-w-[200px]"
              />
              <Button type="button" variant="secondary" disabled={loading} onClick={runLookup}>
                {loading ? "Slår opp…" : "Slå opp"}
              </Button>
            </div>
            {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
          </div>

          {loading && (
            <div className="animate-pulse space-y-2 rounded-md bg-muted/40 p-3">
              <div className="h-3 w-40 rounded bg-muted-foreground/20" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="h-3 w-full rounded bg-muted-foreground/20" />
                <div className="h-3 w-full rounded bg-muted-foreground/20" />
                <div className="h-3 w-full rounded bg-muted-foreground/20" />
                <div className="h-3 w-full rounded bg-muted-foreground/20" />
              </div>
            </div>
          )}

          {!loading && summary && (
            <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Opplysningene under er hentet fra Statens vegvesen. Du kan endre feltene under dersom
              noe er feil, men husk at du etter forbrukerkjøpsloven er ansvarlig for at
              opplysningene om kjøretøyet du oppgir i annonsen er korrekte — rett kun det som
              faktisk er feil.
            </div>
          )}

          {!loading && summary && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">Data fra Statens vegvesen</p>
              {(summary.year || summary.brand || summary.model) && (
                <p className="mt-1 text-muted-foreground">
                  Tittel blir:{" "}
                  <span className="font-medium text-foreground">
                    {[summary.year, summary.brand, summary.model].filter(Boolean).join(" ")}
                  </span>
                </p>
              )}
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                {summary.brand && (
                  <>
                    <dt className="text-muted-foreground">Merke</dt>
                    <dd>{summary.brand}</dd>
                  </>
                )}
                {summary.model && (
                  <>
                    <dt className="text-muted-foreground">Modell</dt>
                    <dd>{summary.model}</dd>
                  </>
                )}
                {summary.year && (
                  <>
                    <dt className="text-muted-foreground">Årsmodell</dt>
                    <dd>{summary.year}</dd>
                  </>
                )}
                {summary.fuel_type && (
                  <>
                    <dt className="text-muted-foreground">Drivstoff</dt>
                    <dd>{summary.fuel_type}</dd>
                  </>
                )}
                {summary.weight_kg && (
                  <>
                    <dt className="text-muted-foreground">Egenvekt</dt>
                    <dd>{summary.weight_kg} kg</dd>
                  </>
                )}
                {summary.power_hk && (
                  <>
                    <dt className="text-muted-foreground">Effekt</dt>
                    <dd>{summary.power_hk} hk</dd>
                  </>
                )}
                {summary.drive_type && (
                  <>
                    <dt className="text-muted-foreground">Hjuldrift</dt>
                    <dd>
                      {summary.drive_type === "4x4"
                        ? "Firehjulsdrift"
                        : summary.drive_type === "bakhjul"
                          ? "Bakhjulsdrift"
                          : "Forhjulsdrift"}
                    </dd>
                  </>
                )}
                {summary.transmission && (
                  <>
                    <dt className="text-muted-foreground">Girkasse</dt>
                    <dd>{summary.transmission === "automat" ? "Automat" : "Manuell"}</dd>
                  </>
                )}
                {summary.tow_hitch != null && (
                  <>
                    <dt className="text-muted-foreground">Hengerfeste</dt>
                    <dd>
                      {summary.tow_hitch
                        ? `Ja${summary.max_tow_weight_kg ? ` (${summary.max_tow_weight_kg} kg)` : ""}`
                        : "Nei"}
                    </dd>
                  </>
                )}
                {summary.seats && (
                  <>
                    <dt className="text-muted-foreground">Antall seter</dt>
                    <dd>{summary.seats}</dd>
                  </>
                )}
                {categoryGroup === "bobil_campingvogn" && summary.sleeping_places && (
                  <>
                    <dt className="text-muted-foreground">Antall soveplasser</dt>
                    <dd>{summary.sleeping_places}</dd>
                  </>
                )}
                {summary.imported_used != null && (
                  <>
                    <dt className="text-muted-foreground">Bruktimportert</dt>
                    <dd>{summary.imported_used ? "Ja" : "Nei"}</dd>
                  </>
                )}
                {summary.first_registration_date && (
                  <>
                    <dt className="text-muted-foreground">Førstegangsregistrering</dt>
                    <dd>{summary.first_registration_date}</dd>
                  </>
                )}
                {summary.color && (
                  <>
                    <dt className="text-muted-foreground">Farge</dt>
                    <dd>{summary.color}</dd>
                  </>
                )}
                {summary.next_eu_control && (
                  <>
                    <dt className="text-muted-foreground">Neste EU-kontroll</dt>
                    <dd>{summary.next_eu_control}</dd>
                  </>
                )}
                {summary.fuel_type !== "el" && summary.cylinders && (
                  <>
                    <dt className="text-muted-foreground">Antall sylindre</dt>
                    <dd>{summary.cylinders}</dd>
                  </>
                )}
                {summary.fuel_type !== "el" && summary.engine_displacement_cc && (
                  <>
                    <dt className="text-muted-foreground">Slagvolum</dt>
                    <dd>{summary.engine_displacement_cc} cc</dd>
                  </>
                )}
                {summary.fuel_type !== "el" && summary.engine_code && (
                  <>
                    <dt className="text-muted-foreground">Motorkode</dt>
                    <dd>{summary.engine_code}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!confirmValue} onOpenChange={(open) => !open && setConfirmValue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Vi fant ikke «{confirmValue?.name}» i vår{" "}
              {confirmValue?.kind === "brand" ? "merke" : "modell"}-liste
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stemmer dette? Vi bruker det på annonsen din nå, og sender det til admin for
              godkjenning før det blir valgbart for andre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmValue(null)}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddValue}>Legg til</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const vehicleLookupModule: CategoryModule = {
  key: "vehicle-lookup",
  Component: VehicleLookupPanel,
  order: 0,
  validateExtra: MODULE_VALIDATORS["vehicle-lookup"],
};
