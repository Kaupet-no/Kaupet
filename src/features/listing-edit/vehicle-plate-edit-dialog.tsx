import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { useCategories } from "@/hooks/use-categories";
import { vehicleCategoryGroupFor, type CategoryNode } from "@/lib/category-filters";
import { useVehicleLookupFlow } from "@/features/listing-creation/use-vehicle-lookup-flow";
import { saveListingField } from "./save-listing-field";
import { getCategoryBehavior } from "@/lib/category-behavior";

/**
 * Modal for changing the registration plate on an existing listing — triggers
 * an external Statens Vegvesen lookup and requires explicit confirmation
 * before writing, unlike every other inline field. Reuses
 * `useVehicleLookupFlow` (already decoupled from the create-wizard's form
 * state) directly.
 */
export function VehiclePlateEditDialog({
  open,
  onOpenChange,
  listingId,
  kaupetCode,
  currentCategoryId,
  attributes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  kaupetCode: string;
  currentCategoryId: string | null;
  attributes: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const [regNr, setRegNr] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: categories } = useCategories();
  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string; slug?: string }>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  const flow = useVehicleLookupFlow({
    categoriesById,
    attributes: attributes as import("@/components/attribute-fields").AttributeMap,
    setAttributes: () => {},
    setCategoryTouchedManually: () => {},
    setSelectedParentId: () => {},
    setValue: () => {},
    goNext: () => {},
  });

  async function runLookup() {
    if (!regNr.trim()) {
      showErrorToast("Skriv inn registreringsnummer.");
      return;
    }
    await flow.runVehicleLookup(regNr.trim());
  }

  async function confirmAndSave() {
    const lookup = flow.vehicleLookupResult;
    if (!lookup) return;
    setSaving(true);
    try {
      const vehicleGroup = currentCategoryId
        ? vehicleCategoryGroupFor(currentCategoryId, allFilters ?? [], categoriesById)
        : null;
      const nextAttributes: Record<string, unknown> = {
        ...attributes,
        is_registered: true,
        registration_number: lookup.registrationNumber,
        vehicle_lookup: JSON.stringify(lookup),
      };
      if (lookup.year) nextAttributes.year = lookup.year;
      if (lookup.fuel_type) nextAttributes.fuel_type = lookup.fuel_type;
      if (lookup.weight_kg != null) nextAttributes.weight_kg = lookup.weight_kg;
      if (lookup.transmission) nextAttributes.transmission = lookup.transmission;
      if (lookup.color) nextAttributes.color = lookup.color;
      if (lookup.power_hk != null) nextAttributes.power_hk = lookup.power_hk;
      if (lookup.drive_type) nextAttributes.drive_type = lookup.drive_type;

      await saveListingField(
        listingId,
        { group: "attributes", attributes: nextAttributes },
        { behavior: getCategoryBehavior(vehicleGroup) },
      );
      await queryClient.invalidateQueries({ queryKey: ["listing", kaupetCode] });
      showSuccessToast("Kjennemerke oppdatert");
      onOpenChange(false);
      flow.adjustVehicleRegistrationNumber();
      setRegNr("");
    } catch (e) {
      showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere kjennemerke"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          flow.adjustVehicleRegistrationNumber();
          setRegNr("");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Endre kjennemerke</DialogTitle>
          <DialogDescription>
            Nytt oppslag hentes fra Statens vegvesen. Bekreft de nye kjøretøydataene før de lagres.
          </DialogDescription>
        </DialogHeader>

        {!flow.vehicleLookupResult ? (
          <div className="space-y-3">
            <Label htmlFor="plate-regnr">Registreringsnummer</Label>
            <Input
              id="plate-regnr"
              value={regNr}
              onChange={(e) => setRegNr(e.target.value.toUpperCase())}
              placeholder="AB12345"
              maxLength={8}
            />
            {flow.vehicleLookupError && (
              <p className="text-sm text-destructive">{flow.vehicleLookupError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Merke/modell: </span>
              {flow.vehicleLookupResult.brand} {flow.vehicleLookupResult.model}
            </p>
            <p>
              <span className="text-muted-foreground">Reg.nr: </span>
              {flow.vehicleLookupResult.registrationNumber}
            </p>
            {flow.vehicleLookupResult.year && (
              <p>
                <span className="text-muted-foreground">Årsmodell: </span>
                {flow.vehicleLookupResult.year}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {!flow.vehicleLookupResult ? (
            <Button type="button" onClick={runLookup} disabled={flow.vehicleLookupLoading}>
              {flow.vehicleLookupLoading && <Loader2 className="size-4 animate-spin" />}
              Slå opp kjøretøy
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={flow.adjustVehicleRegistrationNumber}>
                Juster registreringsnummer
              </Button>
              <Button type="button" onClick={confirmAndSave} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Bekreft og oppdater
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
