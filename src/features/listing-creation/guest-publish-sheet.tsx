import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GuestPublishSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignIn: () => void;
  onSignUp: () => void;
}

/**
 * Vises når en utlogget bruker trykker "Logg inn og publiser" på Se over.
 * Utkastet blir liggende bak arket i stedet for at brukeren forlater siden —
 * begge handlingene gjenbruker dagens redirect-flyt til /auth
 * (flushLocalDraft + returnTo/resume=auth-publish, se ny-annonse.tsx og
 * ny-ok-annonse.tsx), som igjen gjenopptar og publiserer utkastet automatisk
 * etter innlogging.
 */
export function GuestPublishSheet({
  open,
  onOpenChange,
  onSignIn,
  onSignUp,
}: GuestPublishSheetProps) {
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nesten ute! Logg inn for å publisere</DialogTitle>
          <DialogDescription>
            Annonsen er lagret på denne enheten og blir publisert når du er logget inn.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
          <Button className="h-14 w-full" onClick={onSignIn}>
            Logg inn
          </Button>
          <Button variant="secondary" className="h-14 w-full" onClick={onSignUp}>
            Opprett konto
          </Button>
        </div>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
