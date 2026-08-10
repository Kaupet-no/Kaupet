import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";
import { Dialog, DialogPortal } from "@/components/ui/dialog";

/**
 * Full-bleed takeover on top of Radix Dialog: portal, focus trap and
 * escape-to-close for free, without the centered card chrome (border,
 * rounded corners, max-width, built-in close button) `DialogContent` adds —
 * callers render their own header/close control. `title` is visually
 * hidden but required by Radix for screen readers.
 */
const FullscreenOverlayContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }
>(({ className, children, title, ...props }, ref) => (
  <DialogPortal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-background" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn("fixed inset-0 z-[10000] flex flex-col bg-background outline-none", className)}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
FullscreenOverlayContent.displayName = "FullscreenOverlayContent";

export { Dialog as FullscreenOverlay, FullscreenOverlayContent };
