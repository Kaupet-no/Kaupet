import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";

/** Felles feilflate for loader-/renderfeil (boundary) og feil i klientens
 * annonsequery, som kastes i queryFn og aldri når route-boundaryen. */
export function ListingLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Kunne ikke laste annonsen</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatErrorMessage(error, "Prøv på nytt eller gå tilbake til forsiden.")}
      </p>
      <Button className="mt-6" onClick={onRetry}>
        Prøv på nytt
      </Button>
    </div>
  );
}
