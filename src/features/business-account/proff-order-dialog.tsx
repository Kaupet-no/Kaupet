import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { getBusinessOrganization } from "@/lib/business/organization.functions";
import { requestProffSubscription } from "@/lib/business/plans.functions";
import { formatErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { PROFF_TERMS, type ProffTerm } from "./plans";
import { formatProffTermPrice } from "./proff-pricing";

export type ProffOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: ProffTerm;
  /** Første bestilling starter en 30 dagers prøveperiode før første faktura. */
  startsTrial?: boolean;
  onOrdered?: () => void;
};

export function ProffOrderDialog({
  open,
  onOpenChange,
  term,
  startsTrial = false,
  onOrdered,
}: ProffOrderDialogProps) {
  const [billingReference, setBillingReference] = useState("");
  const request = useServerFn(requestProffSubscription);
  const loadBusinessOrganization = useServerFn(getBusinessOrganization);
  const billingQuery = useQuery({
    queryKey: ["business-billing-profile"],
    queryFn: loadBusinessOrganization,
    enabled: open,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: () =>
      request({
        data: {
          term,
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
          <DialogTitle>
            {startsTrial ? "Start 30 dagers prøveperiode" : "Bestill Kaupet Proff"}
          </DialogTitle>
          <DialogDescription>
            {startsTrial
              ? `Proff er gratis de første 30 dagene. Deretter fortsetter det som ${PROFF_TERMS[term].months === 12 ? "årlig" : "månedlig"} abonnement (${formatProffTermPrice(term)}). Første faktura sendes før prøveperioden utløper, med forfall når den utløper. Betales den ikke, opphører Proff når prøveperioden er over.`
              : `${formatProffTermPrice(term)}. Fakturaen sendes på e-post eller EHF, og Proff aktiveres når betalingen er registrert.`}
          </DialogDescription>
        </DialogHeader>

        {mutation.isSuccess ? (
          <Alert role="status">
            <AlertDescription>
              {startsTrial && mutation.data?.trialEndsAt
                ? `Prøveperioden er startet og varer til ${formatDate(mutation.data.trialEndsAt)}. Første faktura sendes til fakturaprofilen før den utløper.`
                : "Bestillingen er mottatt. Fakturaen sendes til fakturaprofilen."}
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
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Fakturaopplysninger</p>
              {billingQuery.isLoading ? (
                <p className="text-muted-foreground">Laster fakturaprofil…</p>
              ) : billingQuery.data?.billingProfile ? (
                <p className="text-muted-foreground">
                  {billingQuery.data.billingProfile.billing_email}
                  {billingQuery.data.billingProfile.address_line
                    ? ` · ${billingQuery.data.billingProfile.address_line}, ${billingQuery.data.billingProfile.postal_code ?? ""} ${billingQuery.data.billingProfile.city ?? ""}`
                    : ""}
                </p>
              ) : (
                <p className="text-muted-foreground">Fakturaprofil mangler.</p>
              )}
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
                ? "Årsabonnementet faktureres forskuddsvis for 12 måneder"
                : "Månedsabonnementet faktureres forskuddsvis hver måned"}
              , med minst 14 dagers betalingsfrist. Ingen bindingstid — abonnementet løper ut betalt
              periode ved oppsigelse.
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
                {pending ? "Sender…" : startsTrial ? "Start prøveperioden" : "Send bestilling"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
