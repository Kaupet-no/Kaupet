import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";
import { useOverlayHistory } from "@/hooks/use-overlay-history";
import { Dialog, DialogPortal } from "@/components/ui/dialog";

/**
 * Som `Dialog`, men med egen historikk-oppføring så Android-tilbake og iOS-
 * kantsveip lukker takeoveren. `historyBack={false}` for flater som med vilje
 * ikke skal kunne lukkes med tilbake (onboarding).
 */
function FullscreenOverlay({
  open,
  onOpenChange,
  historyBack = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof Dialog> & { historyBack?: boolean }) {
  useOverlayHistory(!!open && historyBack, () => onOpenChange?.(false));
  return <Dialog open={open} onOpenChange={onOpenChange} {...props} />;
}

/**
 * Full-bleed takeover on top of Radix Dialog: portal, focus trap and
 * escape-to-close for free, without the centered card chrome (border,
 * rounded corners, max-width, built-in close button) `DialogContent` adds —
 * callers render their own header/close control. `title` is visually
 * hidden but required by Radix for screen readers.
 *
 * Safe area er en egenskap ved primitiven, ikke ved kallstedet: innholdet
 * padres på alle fire kanter som standard, slik at en konsument ikke kan
 * glemme det (5 av 8 gjorde nettopp det før dette). Flater som med vilje skal
 * gå helt ut i kanten — bilde, kart, kameraopptak — setter `edgeToEdge` og
 * padrer sitt eget chrome i stedet; da skal *ikke* medieinnholdet flyttes.
 */
const FullscreenOverlayContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    title: string;
    edgeToEdge?: boolean;
  }
>(({ className, children, title, edgeToEdge = false, ...props }, ref) => (
  <DialogPortal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-background" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-0 z-[10000] flex flex-col bg-background outline-none",
        !edgeToEdge && "p-safe",
        className,
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
FullscreenOverlayContent.displayName = "FullscreenOverlayContent";

export { FullscreenOverlay, FullscreenOverlayContent };
