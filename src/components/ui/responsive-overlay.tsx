import * as React from "react";

import { useFormFactor } from "@/hooks/use-form-factor";
import { useOverlayHistory } from "@/hooks/use-overlay-history";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

/**
 * Bottom Sheet på telefon, sentrert Dialog på nettbrett og web. En
 * fullbredde bunn-skuff er riktig på 375px og feil på 1024px — derfor
 * formatfaktor, ikke bare `isNative()`. Begge bygger på samme
 * @radix-ui/react-dialog-primitiv, så DialogHeader/DialogTitle/
 * DialogDescription/DialogFooter virker som barn uansett hvilken som rendres.
 */
export function ResponsiveOverlay({ open, onOpenChange, children }: Props) {
  const phone = useFormFactor() === "phone";
  // Egen historikk-oppføring: Android-tilbake/iOS-sveip lukker overlayet i
  // stedet for å navigere siden bak det.
  useOverlayHistory(open, () => onOpenChange(false));
  const Root = phone ? Sheet : Dialog;
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Root>
  );
}

export function ResponsiveOverlayContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogContent>) {
  const phone = useFormFactor() === "phone";
  if (phone) {
    return (
      <SheetContent side="bottom" className={cn("rounded-t-2xl", className)} {...props}>
        {children}
      </SheetContent>
    );
  }
  return (
    <DialogContent className={className} {...props}>
      {children}
    </DialogContent>
  );
}
