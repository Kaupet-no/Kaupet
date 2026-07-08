import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryPicker } from "@/components/category-picker";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * First step of the vehicle-first "Bil og MC" path: the only question asked
 * is the registration number (99% of vehicles are registered). Toggling off
 * "registrert" drops into a manual leaf-category picker scoped to the
 * Bil og MC subtree, reproducing today's full manual flow for the ~1% case
 * or for a failed/rejected lookup.
 */
export function VehicleRegistration({
  categories,
  categoryId,
  bilOgMcCategoryId,
  vehicleRegistered,
  setVehicleRegistered,
  vehicleLookupLoading,
  vehicleLookupError,
  vehicleLookupResult,
  runVehicleLookup,
  onCategorySelect,
}: WizardSharedProps) {
  const [regNr, setRegNr] = useState("");

  const isManualLeafChosen = !!categoryId && categoryId !== bilOgMcCategoryId;

  return (
    <section className="space-y-3">
      <Label>
        Registreringsnummer
        <RequiredMark />
      </Label>

      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={vehicleRegistered}
          onCheckedChange={(c) => setVehicleRegistered(c === true)}
        />
        Kjøretøyet er registrert
      </label>

      {vehicleRegistered ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Vi henter kjøretøyopplysninger automatisk fra Statens vegvesen. Du får sjekke og rette
            opplysningene før annonsen opprettes.
          </p>
          <div className="flex gap-2">
            <Input
              value={regNr}
              onChange={(e) => setRegNr(e.target.value.toUpperCase())}
              placeholder="F.eks. AB12345"
              className="max-w-[200px]"
              disabled={vehicleLookupLoading}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={vehicleLookupLoading || !regNr.trim()}
              onClick={() => void runVehicleLookup(regNr)}
            >
              {vehicleLookupLoading ? "Slår opp…" : "Slå opp"}
            </Button>
          </div>
          {vehicleLookupError && (
            <div className="space-y-1.5">
              <p className="text-sm text-destructive">{vehicleLookupError}</p>
              <button
                type="button"
                onClick={() => setVehicleRegistered(false)}
                className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                Fyll inn kjøretøyopplysninger manuelt i stedet
              </button>
            </div>
          )}
          {vehicleLookupResult && (
            <p className="text-sm text-muted-foreground">
              Fant kjøretøyet. Gå videre for å bekrefte opplysningene.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Velg riktig kjøretøytype manuelt i stedet.
          </p>
          <CategoryPicker
            inline
            open={false}
            onOpenChange={() => {}}
            categories={(categories ?? []).filter(
              (c) =>
                c.id === bilOgMcCategoryId ||
                isDescendantOfBilOgMc(c, categories, bilOgMcCategoryId),
            )}
            selectedId={isManualLeafChosen ? categoryId : ""}
            onSelect={onCategorySelect}
          />
        </div>
      )}
    </section>
  );
}

function isDescendantOfBilOgMc(
  category: { id: string; parent_id: string | null },
  categories: WizardSharedProps["categories"],
  bilOgMcCategoryId: string | null,
): boolean {
  if (!bilOgMcCategoryId) return false;
  let cur: { id: string; parent_id: string | null } | undefined = category;
  while (cur?.parent_id) {
    if (cur.parent_id === bilOgMcCategoryId) return true;
    cur = categories.find((c) => c.id === cur!.parent_id);
  }
  return false;
}
