import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { requestProffSubscription } from "@/lib/business.functions";
import { formatErrorMessage } from "@/lib/errors";
import { PROFF_TERMS, type ProffTerm } from "./plans";
import { formatProffTermPrice } from "./proff-pricing";

export type ProffOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: ProffTerm;
  onOrdered?: () => void;
};

export function ProffOrderDialog({ open, onOpenChange, term, onOrdered }: ProffOrderDialogProps) {
  const [billingEmail, setBillingEmail] = useState("");
  const [billingReference, setBillingReference] = useState("");
  const request = useServerFn(requestProffSubscription);

  const mutation = useMutation({
    mutationFn: () =>
      request({
        data: {
          term,
          billingEmail: billingEmail.trim(),
          billingReference: billingReference.trim() || undefined,
        },
      }),
    onSuccess: () => onOrdered?.(),
  });

  const pending = mutation.isPending;
  const errorMessage = mutation.error
    ? formatErrorMessage(mutation.error, "Kunne ikke sende bestillingen. Prøv igjen.")
    : null;

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
    >
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bestill Kaupet Proff</DialogTitle>
          <DialogDescription>
            {formatProffTermPrice(term)}. Fakturaen sendes på e-post eller EHF, og Proff aktiveres
            når betalingen er registrert.
          </DialogDescription>
        </DialogHeader>

        {mutation.isSuccess ? (
          <Alert role="status">
            <AlertDescription>
              Bestillingen er mottatt. Fakturaen kommer til {billingEmail.trim()}.
            </AlertDescription>
          </Alert>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending) mutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="proff-billing-email">E-post for faktura</Label>
              <Input
                id="proff-billing-email"
                type="email"
                required
                autoComplete="email"
                value={billingEmail}
                onChange={(event) => setBillingEmail(event.target.value)}
                placeholder="faktura@bedriften.no"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proff-billing-reference">Deres referanse (valgfri)</Label>
              <Input
                id="proff-billing-reference"
                value={billingReference}
                onChange={(event) => setBillingReference(event.target.value)}
                placeholder="Bestillernavn eller referansenummer"
                maxLength={120}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {PROFF_TERMS[term].months === 12
                ? "Årsabonnementet faktureres forskuddsvis for 12 måneder."
                : "Månedsabonnementet faktureres forskuddsvis hver måned."}{" "}
              Ingen bindingstid — abonnementet løper ut betalt periode ved oppsigelse.
            </p>
            {errorMessage && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                {pending ? "Sender…" : "Send bestilling"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
