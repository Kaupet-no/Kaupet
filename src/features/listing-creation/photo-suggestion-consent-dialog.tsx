import { Link } from "@tanstack/react-router";

import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PHOTO_SUGGESTION_LIMITS } from "@/lib/photo-suggestion-images";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Samtykke vist FØR noe sendes til Mistral, se
 * docs/decisions/2026-09-04-photo-assisted-listing-suggestions.md § 2. Ett
 * trykk på "Analyser bildene" dekker både identify (kalt med det samme) og
 * en ev. senere "Foreslå detaljer"-forespørsel for samme inputRevision — se
 * use-photo-suggestion.ts.
 */
export function PhotoSuggestionConsentDialog({ open, onOpenChange, onConfirm }: Props) {
  const identify = PHOTO_SUGGESTION_LIMITS.identify;
  const attributes = PHOTO_SUGGESTION_LIMITS.attributes;
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Analysere bildene med KI?</DialogTitle>
          <DialogDescription asChild>
            <ul className="list-disc space-y-2 pl-5 text-left">
              <li>
                Vi sender opptil {identify.maxImages} nedskalerte kopier av bildene dine (maks{" "}
                {identify.maxDimension} piksler) og tittelen til Mistral AI i EU for å foreslå
                kategori. Hvis du bekrefter kategorien, sendes opptil {attributes.maxImages} kopier
                (maks {attributes.maxDimension} piksler) for å foreslå detaljer.
              </li>
              <li>Posisjon og annen informasjon lagret i bildefilen (EXIF) fjernes før sending.</li>
              <li>
                Mistral lagrer forespørselen i opptil 30 dager for å oppdage misbruk, og sletter den
                deretter. Bildene brukes ikke til å trene KI-modeller.
              </li>
              <li>Kaupet lagrer ikke kopiene. Du ser over alle forslag før noe fylles inn.</li>
            </ul>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
          <Link
            to="/personvern"
            hash="bildeforslag"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Les mer i personvernerklæringen
          </Link>
          <Button className="h-14 w-full native-touch-target" onClick={onConfirm}>
            Analyser bildene
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full native-touch-target"
            onClick={() => onOpenChange(false)}
          >
            Avbryt
          </Button>
        </div>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
