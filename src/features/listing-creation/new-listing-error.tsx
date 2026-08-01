import { useRouter, Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";

export function NewListingError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <AlertCircle className="mx-auto size-10 text-destructive" />
      <h1 className="mt-4 font-display text-2xl">Noe gikk galt</h1>
      <p className="mt-2 text-muted-foreground">{formatErrorMessage(error, "Ukjent feil")}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Utkastet ditt er lagret — du kan trygt prøve på nytt.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button
          variant="outline"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
        >
          Prøv igjen
        </Button>
        <Button asChild>
          <Link to="/mine-annonser">Mine annonser</Link>
        </Button>
      </div>
    </div>
  );
}
