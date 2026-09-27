import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { IntentTitleLanding } from "@/components/intent-title-landing";

type Intent = "sell" | "buy" | "free";

/**
 * Shared "Ny annonse"-overlay (valg av annonsetype) for inngangspunkter
 * utenfor bunn-nav/forside — se IntentTitleLanding.
 */
export function NewListingDialog({
  open,
  onOpenChange,
  defaultIntent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultIntent?: Intent;
}) {
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-4xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Hva vil du gjøre?</DialogTitle>
        </DialogHeader>
        <IntentTitleLanding onNavigate={() => onOpenChange(false)} defaultIntent={defaultIntent} />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
