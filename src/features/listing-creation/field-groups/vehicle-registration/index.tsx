import { Label } from "@/components/ui/label";
import { CategoryPicker } from "@/components/category-picker";
import { AttributeFields } from "@/components/attribute-fields";
import { VEHICLE_WIZARD_MANAGED_KEYS } from "@/lib/vehicle-lookup.server";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";
import { VehicleLookupConfirmDialog } from "./vehicle-lookup-confirm-dialog";

/**
 * First step of the vehicle-first "Bil og MC" path: the only question asked
 * is the registration number (99% of vehicles are registered, so that's the
 * assumed default — "ikke registrert" is a low-weight escape hatch, not a
 * checkbox the majority has to interact with). The lookup itself is
 * triggered by the wizard's "Neste" button (see ny-annonse.tsx's
 * goToNextPage), not a dedicated button here — a Norwegian plate never has
 * more than 7 characters, so the field is capped to match.
 */
export function VehicleRegistration(props: WizardSharedProps) {
  const {
    categories,
    categoryId,
    bilOgMcCategoryId,
    vehicleRegistered,
    setVehicleRegistered,
    vehicleLookupLoading,
    vehicleLookupError,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    onCategorySelect,
    attributes,
    onAttributesChange,
    attributesTouched,
  } = props;

  const isManualLeafChosen = !!categoryId && categoryId !== bilOgMcCategoryId;

  return (
    <section className="space-y-3">
      <Label htmlFor="vehicle-reg-nr">
        Registreringsnummer
        <RequiredMark />
      </Label>

      {vehicleRegistered ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Trykk Neste for å hente kjøretøyopplysninger automatisk fra Statens vegvesen. Du får
            sjekke og rette opplysningene før annonsen opprettes. Deretter fyller du ut noen få
            detaljer om pris, tilstand og bilder — tar vanligvis bare et par minutter til.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex h-20 w-72 items-stretch overflow-hidden rounded-lg bg-white shadow-md ${
                vehicleLookupError ? "ring-2 ring-destructive" : ""
              }`}
            >
              <div className="flex w-10 flex-col items-center justify-center gap-1 bg-blue-700">
                <svg viewBox="0 0 22 16" className="h-4 w-[22px]" aria-hidden>
                  <rect width="22" height="16" fill="#ef2b2d" />
                  <rect x="6" width="4" height="16" fill="#fff" />
                  <rect y="6" width="22" height="4" fill="#fff" />
                  <rect x="7" width="2" height="16" fill="#002868" />
                  <rect y="7" width="22" height="2" fill="#002868" />
                </svg>
                <span className="text-lg font-bold leading-none text-white">N</span>
              </div>
              <input
                id="vehicle-reg-nr"
                value={vehicleRegNrInput}
                onChange={(e) => setVehicleRegNrInput(e.target.value.toUpperCase().slice(0, 7))}
                maxLength={7}
                placeholder="AB 12345"
                disabled={vehicleLookupLoading}
                aria-invalid={!!vehicleLookupError}
                aria-describedby={vehicleLookupError ? "vehicle-reg-nr-error" : undefined}
                className="w-full flex-1 bg-white px-2 text-center font-mono text-4xl font-bold tracking-[0.08em] text-neutral-900 outline-none placeholder:text-black/20 disabled:opacity-60"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </div>
          </div>

          {vehicleLookupError && (
            <p
              id="vehicle-reg-nr-error"
              role="status"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              {vehicleLookupError}
            </p>
          )}

          <button
            type="button"
            onClick={() => setVehicleRegistered(false)}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Kjøretøyet er ikke registrert
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Ingen problem — velg riktig kjøretøytype manuelt i stedet, så fyller du inn de samme
            opplysningene selv (f.eks. for et importert eller uregistrert kjøretøy).
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
            initialParentId={bilOgMcCategoryId ?? undefined}
            selectedId={isManualLeafChosen ? categoryId : ""}
            onSelect={onCategorySelect}
          />

          {isManualLeafChosen && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm text-muted-foreground">
                Fyll inn kjøretøyets tekniske opplysninger manuelt.
              </p>
              <AttributeFields
                categoryId={categoryId}
                categories={categories ?? []}
                value={attributes}
                onChange={onAttributesChange}
                showErrors={attributesTouched}
                hiddenKeys={VEHICLE_WIZARD_MANAGED_KEYS}
                required
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setVehicleRegistered(true)}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Kjøretøyet er registrert likevel
          </button>
        </div>
      )}

      <VehicleLookupConfirmDialog {...props} />
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
