import type { WizardSharedProps } from "../types";
import { Price } from "../price";
import { SimilarListings } from "../similar-listings";

/**
 * Dedikert, visuelt distinkt siste-steg for kjøretøy: Pris +
 * omregistreringsavgift (kjøpers totalpris, se `Price`'s "Pris synlig i
 * annonse"-felt) samlet på én side rett før forhåndsvisning/publisering —
 * ikke lenger bundlet inn i `vehicle-facts` sammen med Tittel/Undertittel/
 * Kilometerstand/Beskrivelse. Stor skrift (`heroSize` på `Price`) skiller
 * siden visuelt fra resten av annonseopprettelsesflyten, siden dette er
 * annonsens viktigste tall for både selger og kjøper.
 *
 * Runtime-injisert (se `withRuntimeFieldGroups`), ikke et lagret
 * field-group — samme mønster som `vehicle-360`.
 */
export function VehiclePriceGroup(props: WizardSharedProps) {
  if (props.lockedFree === "free") return null;
  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Hva skal det koste?</h2>
        <p className="text-sm text-muted-foreground">
          Prisen vises på annonsen sammen med eventuell omregistreringsavgift kjøper betaler.
        </p>
      </div>
      <div className="w-full max-w-sm text-left">
        <Price {...props} heroSize />
      </div>
      <SimilarListings similarListings={props.similarListings} />
    </section>
  );
}
