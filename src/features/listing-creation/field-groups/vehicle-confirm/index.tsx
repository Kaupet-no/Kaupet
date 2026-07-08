import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import type { VehicleBrandGroup } from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";

const LEAF_LABELS_NB: Record<VehicleLeafSlug, string> = {
  personbil: "Personbil",
  varebil: "Varebil",
  "bobil-og-campingvogn": "Bobil/campingvogn",
  motorsykkel: "Motorsykkel",
  "moped-og-scooter": "Moped/scooter",
  "atv-og-snoscooter": "ATV/snøscooter",
  "tilhenger-leaf": "Tilhenger",
};

/**
 * Dedicated confirmation step for the vehicle-first flow: shown only after a
 * successful Statens Vegvesen lookup. Displays the auto-detected vehicle
 * type (editable, in case classification is missing/low-confidence or the
 * user disagrees) plus the full fetched data set, and requires an explicit
 * "Bekreft og fortsett" before the category/attributes are committed.
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
  matchVehicleBrandForLeaf,
  confirmVehicleData,
  rejectVehicleLookup,
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
        showSuccessToast(`«${brand.name}» er sendt til admin for godkjenning.`);
        if (pendingModelName) chainToModel = pendingModelName;
      } else if (!brandId) {
        showErrorToast("Velg merke før du legger til modell.");
      } else {
        const model = await createVehicleModel({ data: { brandId, name: confirmValue.name } });
        setModelName(model.name);
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
      }
    }
  }

  if (!vehicleLookupResult) return null;
  const lookup = vehicleLookupResult;

  return (
    <section className="space-y-3">
      <div className="space-y-2">
        <Label>Kjøretøytype</Label>
        {detectedSlug && vehicleClassification?.confidence === "high" ? (
          <p className="text-sm text-muted-foreground">
            Vi har funnet ut at dette er en{" "}
            <span className="font-medium text-foreground">{LEAF_LABELS_NB[detectedSlug]}</span>.
            Stemmer ikke dette?
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Vi klarte ikke å avgjøre kjøretøytype automatisk. Velg riktig type under.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {VEHICLE_LEAF_SLUGS.filter((slug) => leafBySlug.has(slug)).map((slug) => (
            <button
              key={slug}
              type="button"
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
        kjøretøyet du oppgir i annonsen er korrekte — rett kun det som faktisk er feil.
      </div>

      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="font-medium">Data fra Statens vegvesen</p>
        {(lookup.year || lookup.brand || lookup.model) && (
          <p className="mt-1 text-muted-foreground">
            Tittel blir:{" "}
            <span className="font-medium text-foreground">
              {[lookup.year, lookup.brand, lookup.model].filter(Boolean).join(" ")}
            </span>
          </p>
        )}
        {matching && <p className="mt-1 text-xs text-muted-foreground">Sjekker merke/modell…</p>}
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
          {(brandName ?? lookup.brand) && (
            <>
              <dt className="text-muted-foreground">Merke</dt>
              <dd>{brandName ?? lookup.brand}</dd>
            </>
          )}
          {(modelName ?? lookup.model) && (
            <>
              <dt className="text-muted-foreground">Modell</dt>
              <dd>{modelName ?? lookup.model}</dd>
            </>
          )}
          {lookup.year && (
            <>
              <dt className="text-muted-foreground">Årsmodell</dt>
              <dd>{lookup.year}</dd>
            </>
          )}
          {lookup.fuel_type && (
            <>
              <dt className="text-muted-foreground">Drivstoff</dt>
              <dd>{lookup.fuel_type}</dd>
            </>
          )}
          {lookup.weight_kg && (
            <>
              <dt className="text-muted-foreground">Egenvekt</dt>
              <dd>{lookup.weight_kg} kg</dd>
            </>
          )}
        </dl>

        {/* Secondary fields collapsed by default — keeps the confirm step
            from being one long scroll on small/native screens; still all
            visible/editable via "Vis flere detaljer". */}
        <details className="mt-2 group">
          <summary className="cursor-pointer text-xs text-primary select-none">
            <span className="group-open:hidden">Vis flere detaljer</span>
            <span className="hidden group-open:inline">Skjul flere detaljer</span>
          </summary>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {lookup.power_hk && (
              <>
                <dt className="text-muted-foreground">Effekt</dt>
                <dd>{lookup.power_hk} hk</dd>
              </>
            )}
            {lookup.drive_type && (
              <>
                <dt className="text-muted-foreground">Hjuldrift</dt>
                <dd>
                  {lookup.drive_type === "4x4"
                    ? "Firehjulsdrift"
                    : lookup.drive_type === "bakhjul"
                      ? "Bakhjulsdrift"
                      : "Forhjulsdrift"}
                </dd>
              </>
            )}
            {lookup.transmission && (
              <>
                <dt className="text-muted-foreground">Girkasse</dt>
                <dd>{lookup.transmission === "automat" ? "Automat" : "Manuell"}</dd>
              </>
            )}
            {lookup.tow_hitch != null && (
              <>
                <dt className="text-muted-foreground">Hengerfeste</dt>
                <dd>
                  {lookup.tow_hitch
                    ? `Ja${lookup.max_tow_weight_kg ? ` (${lookup.max_tow_weight_kg} kg)` : ""}`
                    : "Nei"}
                </dd>
              </>
            )}
            {lookup.seats && (
              <>
                <dt className="text-muted-foreground">Antall seter</dt>
                <dd>{lookup.seats}</dd>
              </>
            )}
            {selectedSlug === "bobil-og-campingvogn" && lookup.sleeping_places && (
              <>
                <dt className="text-muted-foreground">Antall soveplasser</dt>
                <dd>{lookup.sleeping_places}</dd>
              </>
            )}
            {lookup.imported_used != null && (
              <>
                <dt className="text-muted-foreground">Bruktimportert</dt>
                <dd>{lookup.imported_used ? "Ja" : "Nei"}</dd>
              </>
            )}
            {lookup.first_registration_date && (
              <>
                <dt className="text-muted-foreground">Førstegangsregistrering</dt>
                <dd>{lookup.first_registration_date}</dd>
              </>
            )}
            {lookup.color && (
              <>
                <dt className="text-muted-foreground">Farge</dt>
                <dd>{lookup.color}</dd>
              </>
            )}
            {lookup.next_eu_control && (
              <>
                <dt className="text-muted-foreground">Neste EU-kontroll</dt>
                <dd>{lookup.next_eu_control}</dd>
              </>
            )}
            {lookup.fuel_type !== "el" && lookup.cylinders && (
              <>
                <dt className="text-muted-foreground">Antall sylindre</dt>
                <dd>{lookup.cylinders}</dd>
              </>
            )}
            {lookup.fuel_type !== "el" && lookup.engine_displacement_cc && (
              <>
                <dt className="text-muted-foreground">Slagvolum</dt>
                <dd>{lookup.engine_displacement_cc} cc</dd>
              </>
            )}
            {lookup.fuel_type !== "el" && lookup.engine_code && (
              <>
                <dt className="text-muted-foreground">Motorkode</dt>
                <dd>{lookup.engine_code}</dd>
              </>
            )}
          </dl>
        </details>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={rejectVehicleLookup}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Feil treff / kjøretøyet er ikke registrert
        </button>
        <Button
          type="button"
          disabled={!selectedSlug || matching || !!confirmValue}
          onClick={() => {
            const leaf = selectedSlug ? leafBySlug.get(selectedSlug) : null;
            if (leaf)
              void confirmVehicleData(leaf.id, {
                brandName: brandName ?? undefined,
                modelName: modelName ?? undefined,
              });
          }}
        >
          Bekreft og fortsett
        </Button>
      </div>

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
    </section>
  );
}
