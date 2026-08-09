import * as React from "react";

import { useIsNative } from "@/hooks/use-is-native";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

/**
 * Dialog on web, bottom Sheet on native — per UI-GUIDE.md's "native uses
 * Sheet" rule. Both are built on the same @radix-ui/react-dialog primitive,
 * so DialogHeader/DialogTitle/DialogDescription/DialogFooter work as
 * children regardless of which one renders.
 */
export function ResponsiveOverlay({ open, onOpenChange, children }: Props) {
  const native = useIsNative();
  const Root = native ? Sheet : Dialog;
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
  const native = useIsNative();
  if (native) {
    return (
      <SheetContent side="bottom" className={cn("rounded-t-2xl pb-8", className)} {...props}>
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
