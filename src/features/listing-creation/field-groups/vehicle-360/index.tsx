import { Label } from "@/components/ui/label";
import { Vehicle360QrPanel } from "@/components/vehicle-360-qr-panel";
import { Vehicle360CaptureLauncher } from "@/components/vehicle-360-capture-launcher";

import type { WizardSharedProps } from "../types";

/**
 * 360°-opptak som eget, valgfritt steg i kjøretøyflyten. Ligger her og ikke
 * på bildesteget fordi bildesteget nå alltid er steg 1 — før kategori er
 * bekreftet — og 360-opptak bare gir mening for Bil og MC. Steget injiseres
 * derfor på runtime rett etter at kjøretøyet er bekreftet (se
 * `fieldGroupKeys`-memoet i ny-annonse.tsx), aldri fra en lagret flow.
 *
 * Har bevisst ingen validering i registry-en: opptaket er et tillegg som
 * gjør annonsen bedre, og skal aldri blokkere "Neste".
 */
export function Vehicle360Group(props: WizardSharedProps) {
  return (
    <section className="space-y-3">
      <Label>360°-opptak</Label>
      <p className="text-sm text-muted-foreground">
        Et 360°-opptak lar kjøpere se rundt hele kjøretøyet. Annonser med 360°-opptak får mer
        oppmerksomhet. Du kan legge til 360°-visning når som helst gjennom Kaupet-appen.
      </p>
      {props.native ? (
        <Vehicle360CaptureLauncher
          listingId={props.draftId}
          ensureListingId={props.ensureDraftId}
          listingTitle={props.title || "kjøretøyet ditt"}
        />
      ) : (
        <Vehicle360QrPanel draftId={props.draftId} ensureDraftId={props.ensureDraftId} />
      )}
    </section>
  );
}
