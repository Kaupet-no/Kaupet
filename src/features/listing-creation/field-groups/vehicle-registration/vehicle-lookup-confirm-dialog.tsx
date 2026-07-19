import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { WizardSharedProps } from "../types";

/**
 * Shown right after a successful Statens Vegvesen lookup, before the
 * vehicle-confirm step's type-picker + detail table. Gives a fast, focused
 * confirmation of the lookup itself (Regnr/Merke/Modell) so the user can
 * catch a mistyped plate before wading into the fuller detail review.
 */
export function VehicleLookupConfirmDialog({
  vehicleLookupResult,
  vehicleLookupConfirmOpen,
  setVehicleLookupConfirmOpen,
  adjustVehicleRegistrationNumber,
  confirmVehicleLookupAndContinue,
}: WizardSharedProps) {
  if (!vehicleLookupResult) return null;
  const lookup = vehicleLookupResult;

  return (
    <Dialog
      open={vehicleLookupConfirmOpen}
      onOpenChange={(open) => setVehicleLookupConfirmOpen(open)}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Fant kjøretøyet</DialogTitle>
          <DialogDescription>Stemmer opplysningene under?</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Registreringsnummer</dt>
          <dd className="font-medium">{lookup.registrationNumber}</dd>
          {lookup.brand && (
            <>
              <dt className="text-muted-foreground">Merke</dt>
              <dd className="font-medium">{lookup.brand}</dd>
            </>
          )}
          {lookup.model && (
            <>
              <dt className="text-muted-foreground">Modell</dt>
              <dd className="font-medium">{lookup.model}</dd>
            </>
          )}
        </dl>

        <DialogFooter className="flex-col sm:flex-col sm:space-x-0 gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => void confirmVehicleLookupAndContinue()}
          >
            Stemmer, fortsett
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={adjustVehicleRegistrationNumber}
          >
            Juster registreringsnummer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
