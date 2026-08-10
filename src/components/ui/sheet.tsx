"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-[10000] bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-[10000] gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        // pb: p-6 som basis, men aldri under home indicator-sonen. Uten dette
        // havnet nederste innholdsrad i hver eneste native bunn-sheet under
        // indikatoren, og hvert kallsted måtte kompensere for hånd.
        bottom:
          "inset-x-0 bottom-0 border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

/** Dra forbi dette (px) — eller slipp fortere enn hastighetsgrensen — lukker. */
const DRAG_CLOSE_PX = 96;
const DRAG_CLOSE_VELOCITY = 0.5; // px/ms

/** Nærmeste scrollbare forelder innenfor sheeten, eller null. */
function scrolledContainer(from: EventTarget | null, stop: HTMLElement): boolean {
  let el = from instanceof HTMLElement ? from : null;
  while (el && el !== stop.parentElement) {
    if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Dra-for-å-lukke på bunn-sheets (fase 7, tiltak 17). Håndrullet fremfor
 * `vaul`: gesten er ~40 linjer uten detents, og biblioteket ble fjernet som
 * ubrukt i UX-AUDIT-PLAN fase 2. Trenger søkepanelet i fase 9 detents, er det
 * der `vaul` eventuelt kommer tilbake — da kan denne erstattes.
 *
 * Lukkingen går via Escape, ikke via en egen callback: da arver gesten samme
 * regler som tastaturet, inkludert sheets som bevisst blokkerer lukking med
 * `onEscapeKeyDown`.
 */
function useSheetDrag(enabled: boolean) {
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const start = React.useRef<{ y: number; t: number } | null>(null);

  if (!enabled) return { contentProps: {} };

  const end = () => {
    const from = start.current;
    start.current = null;
    setDragging(false);
    if (!from) return;
    const velocity = offset / Math.max(1, Date.now() - from.t);
    if (offset > DRAG_CLOSE_PX || velocity > DRAG_CLOSE_VELOCITY) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    setOffset(0);
  };

  return {
    contentProps: {
      onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length !== 1) return;
        // Dra bare når innholdet faktisk står i toppen — ellers ville gesten
        // stjålet scrollingen i en scrollbar sheet.
        if (scrolledContainer(e.target, e.currentTarget)) return;
        start.current = { y: e.touches[0].clientY, t: Date.now() };
        setDragging(true);
      },
      onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => {
        if (!start.current) return;
        setOffset(Math.max(0, e.touches[0].clientY - start.current.y));
      },
      onTouchEnd: end,
      onTouchCancel: end,
      style: {
        transform: offset ? `translate3d(0, ${offset}px, 0)` : undefined,
        // Sheeten har `duration-500` fra åpne-animasjonen; uten dette ville
        // dra-bevegelsen ligget et halvt sekund etter fingeren.
        transitionDuration: dragging ? "0ms" : undefined,
      } satisfies React.CSSProperties,
    },
  };
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => {
  const drag = useSheetDrag(side === "bottom");
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...props}
        {...drag.contentProps}
      >
        {side === "bottom" && (
          // Draghåndtak. Selve dra-gesten ligger på hele sheeten (se
          // useSheetDrag) — håndtaket er affordansen, ikke treffflaten.
          // Absolutt plassert med vilje: bunn-sheetene har alt fra `p-0` til
          // `p-6`, og håndtaket skal ikke flytte innholdet i noen av dem.
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30"
          />
        )}
        {/* Se dialog.tsx: 44px trykkflate, 16px ikon, negativ margin for å beholde
          den optiske plasseringen inne i p-6. */}
        <SheetPrimitive.Close className="absolute right-4 top-4 -mr-3.5 -mt-3.5 flex size-11 items-center justify-center rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">Lukk</span>
        </SheetPrimitive.Close>
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
