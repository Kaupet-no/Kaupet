import { Label } from "@/components/ui/label";
import { Vehicle360QrPanel } from "@/components/vehicle-360-qr-panel";
import { Vehicle360CaptureLauncher } from "@/components/vehicle-360-capture-launcher";

import type { WizardSharedProps } from "../types";

/**
 * Valgfri 360°-forbedring for kjøretøy. Rendres på reviewflaten etter de
 * ordinære annonseopplysningene, ikke som et eget stopp i minimumsflyten.
 *
 * Har bevisst ingen validering i registry-en: opptaket er et tillegg som
 * gjør annonsen bedre, og skal aldri blokkere publisering.
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
