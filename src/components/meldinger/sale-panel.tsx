import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ReviewForm } from "@/components/meldinger/review-form";

type SalePanelProps = {
  isSeller: boolean;
  sale: { listing_id: string; buyer_id: string; seller_id: string; conversation_id: string } | null;
  saleIsForThisConversation: boolean;
  saleConfirmedForOtherBuyer: boolean;
  iAmInSale: boolean;
  otherName: string;
  otherDeleted: boolean;
  myReview: { id: string; rating: number; comment: string | null } | null;
  onConfirm: () => void;
  onUnconfirm: () => void;
  confirming: boolean;
  unconfirming: boolean;
  onSubmitReview: (rating: number, comment: string) => Promise<void>;
};

export function SalePanel(props: SalePanelProps) {
  const {
    isSeller,
    sale,
    saleConfirmedForOtherBuyer,
    iAmInSale,
    otherName,
    otherDeleted,
    myReview,
    onConfirm,
    onUnconfirm,
    confirming,
    unconfirming,
    onSubmitReview,
  } = props;

  if (otherDeleted) return null;

  // No sale yet
  if (!sale) {
    if (!isSeller) return null;
    return (
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">Solgte du gjenstanden til {otherName}?</p>
          <p className="text-xs text-muted-foreground">
            Marker som solgt for å låse annonsen og åpne for vurdering av kjøperen.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" className="gap-2" disabled={confirming}>
              {confirming && <Loader2 className="size-4 animate-spin" />}
              <CheckCircle2 className="size-4" /> Marker som solgt
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bekreft kjøper</AlertDialogTitle>
              <AlertDialogDescription>
                {`Marker ${otherName} som kjøper av denne annonsen? Annonsen settes til «solgt» og kan ikke vises som aktiv igjen før salget eventuelt angres.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>Bekreft</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Sale exists but is for a different conversation/buyer
  if (saleConfirmedForOtherBuyer) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Denne annonsen er allerede markert som solgt til en annen kjøper.
      </div>
    );
  }

  // Sale is for this conversation
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4 text-primary" />
          {isSeller ? `Solgt til ${otherName}` : `Du er bekreftet som kjøper av denne annonsen`}
        </p>
        {isSeller && !myReview && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onUnconfirm}
            disabled={unconfirming}
            className="text-xs"
          >
            {unconfirming && <Loader2 className="size-3 animate-spin" />}
            Angre salg
          </Button>
        )}
      </div>

      {iAmInSale && (
        <ReviewForm myReview={myReview} otherName={otherName} onSubmit={onSubmitReview} />
      )}
    </div>
  );
}
