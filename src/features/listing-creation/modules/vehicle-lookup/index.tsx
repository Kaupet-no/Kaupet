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

      if (brandMatch) next.brand = brandMatch.name;
      if (modelMatch) next.model = modelMatch.name;
      onChange(next);
      setSummary({
        brand: lookup.brand,
        model: lookup.model,
        year: lookup.year,
        fuel_type: lookup.fuel_type,
        weight_kg: lookup.weight_kg,
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
