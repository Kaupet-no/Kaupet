import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { IntentTitleLanding } from "@/components/intent-title-landing";

type Intent = "sell" | "buy" | "free";

/**
 * Shared "Ny annonse"-overlay (intent + tittel, med kategoriforslag) for
 * inngangspunkter utenfor bunn-nav/forside. Direkte lenker til /ny-annonse
 * eller /ny-ok-annonse uten title-param hopper over category-confirm-steget
 * i wizarden — se ny-annonse.tsx/ny-ok-annonse.tsx sin skipCategoryStep.
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
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hva vil du annonsere?</DialogTitle>
        </DialogHeader>
        <IntentTitleLanding onNavigate={() => onOpenChange(false)} defaultIntent={defaultIntent} />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
