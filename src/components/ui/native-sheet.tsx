import * as React from "react";

import { SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  titleVisible?: boolean;
  headerClassName?: string;
  className?: string;
  expandable?: boolean;
  initialSnapPoint?: number;
  children: React.ReactNode;
};

/**
 * Bunn-drawer på telefon, sentrert dialog på nettbrett/web — bygget på
 * ResponsiveOverlay. Fanger opp mønsteret som var duplisert i
 * messages-button/notifications-bell/category-picker m.fl.: header med
 * (som regel skjult) tittel, ingen egen draghåndtak siden SheetContent
 * alt tegner en for `side="bottom"`.
 */
export function NativeSheet({
  open,
  onOpenChange,
  trigger,
  title,
  titleVisible = false,
  headerClassName,
  className,
  expandable,
  initialSnapPoint,
  children,
}: Props) {
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <ResponsiveOverlayContent
        className={className}
        expandable={expandable}
        initialSnapPoint={initialSnapPoint}
      >
        {/* Tittelen ligger i rulleområdet, som klipper alt som stikker ut til
        venstre. Displayfontens halvfete vekt tegnes litt utenfor boksen, så
        uten innrykk mister en venstrejustert tittel deler av første bokstav. */}
        <SheetHeader className={titleVisible ? cn("px-0.5", headerClassName) : "sr-only"}>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
