"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { expandSheetBeforeScroll } from "@/lib/sheet-gestures";
import { cn } from "@/lib/utils";

/** `open`/`onOpenChange` for kallstedet som ligger nærmest — lar `SheetContent`
 * bygge sin egen nøstede `Drawer.Root` (vaul) for `side="bottom"` uten at
 * kallstedene selv trenger å vite om det. `SheetTrigger`/`SheetClose`/
 * `SheetTitle` fortsetter å virke uendret uansett side: de er Radix-
 * primitiver bundet til den ytre `SheetPrimitive.Root`-konteksten under, som
 * fortsatt finnes og fortsatt er den som faktisk driver åpen/lukket-tilstand
 * — `Drawer.Root` er bare et nøstet, ekstra lag rundt bunn-innholdet som
 * speiler samme state.
 *
 * Den ytre Radix-Rooten holdes bevisst (i stedet for en ren context-provider
 * uten Radix-primitiv): `ResponsiveOverlay` bytter mellom `Sheet` og `Dialog`
 * som samme `Root`-variabel avhengig av `useFormFactor()`, og
 * `ResponsiveOverlayContent` gjør samme sjekk uavhengig av — de to kan derfor
 * ha ulikt svar ett render til de synkroniseres. Så lenge `Sheet` (som
 * `Dialog`) er en ekte `@radix-ui/react-dialog`-Root, tåler `DialogContent`
 * å rendres midlertidig inni feil valgt Root uten å krasje; en ren
 * context-provider uten den ekte primitiven gjorde ikke det. */
const SheetOpenContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <SheetOpenContext.Provider value={{ open, onOpenChange }}>
      <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </SheetPrimitive.Root>
    </SheetOpenContext.Provider>
  );
}

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
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
        // Reell fallback hvis SheetContent noensinne rendres uten en `Sheet`-
        // forelder (ctx null) — se bruken i komponenten under.
        bottom:
          "inset-x-0 bottom-0 border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

/** Samme boks-styling som `sheetVariants`s base + bunn-plassering, men uten
 * Radix' animate-in/out-klasser — `Drawer.Content` (vaul) animerer selv via
 * transform, og ville dobbelt-animert sammen med Tailwinds enter/exit. */
const drawerContentClass =
  "fixed inset-x-0 bottom-0 z-[10000] flex flex-col gap-4 border-t bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg outline-none";

export interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Adds a full-height detent for sheets whose initial height hides content. */
  expandable?: boolean;
  /** Visible viewport fraction before an expandable sheet is expanded. */
  initialSnapPoint?: number;
}

const closeButtonClass =
  "absolute right-4 top-4 -mr-3.5 -mt-3.5 flex size-11 items-center justify-center rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary";

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    { side = "right", className, children, expandable = false, initialSnapPoint = 0.8, ...props },
    ref,
  ) => {
    const ctx = React.useContext(SheetOpenContext);
    const [activeSnapPoint, setActiveSnapPoint] = React.useState<number | string | null>(
      initialSnapPoint,
    );
    const snapPoints = React.useMemo(
      () => (expandable ? [initialSnapPoint, 1] : undefined),
      [expandable, initialSnapPoint],
    );

    // Bunn-sheets kjøres på `vaul` (fase 14): moden, mye brukt gest-håndtering
    // for nøyaktig dette. Korte sheets dras fortsatt bare fra håndtaket. Sheets
    // med skjult innhold kan dras fra scrollflaten og får en fullhøyde-detent;
    // vaul håndterer motstand, snap-back og lukkegrense.
    //
    // `[data-vaul-drawer]` (Drawer.Content selv) får `touch-action: none` fra
    // vauls egen stylesheet, uavhengig av `handleOnly` — det er det som lar
    // biblioteket avgjøre dra-vs-scroll selv. Innhold som skal kunne
    // touch-scrolles (som `className="overflow-y-auto"`-callerne her) må derfor
    // ligge i et eget barn under Drawer.Content, ikke direkte på den, ellers
    // blokkerer touch-action all touch-scroll i den — musehjul/programmatisk
    // scroll virker fortsatt, som gjorde dette lett å overse i vanlig nettleser.
    if (side === "bottom" && ctx) {
      const fullHeight = activeSnapPoint === 1;
      return (
        <Drawer.Root
          open={ctx.open}
          onOpenChange={ctx.onOpenChange}
          handleOnly={!expandable}
          snapPoints={snapPoints}
          activeSnapPoint={expandable ? activeSnapPoint : undefined}
          setActiveSnapPoint={expandable ? setActiveSnapPoint : undefined}
          closeThreshold={0.35}
          onAnimationEnd={(open) => {
            if (!open && expandable) setActiveSnapPoint(initialSnapPoint);
          }}
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-[10000] bg-black/80" />
            <Drawer.Content
              ref={ref}
              className={cn(drawerContentClass, expandable && "h-[97dvh] max-h-[97dvh]")}
              {...props}
            >
              <Drawer.Handle className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
              {/* Se dialog.tsx: 44px trykkflate, 16px ikon, negativ margin for å
              beholde den optiske plasseringen inne i p-6. */}
              <SheetPrimitive.Close className={closeButtonClass}>
                <X className="h-4 w-4" />
                <span className="sr-only">Lukk</span>
              </SheetPrimitive.Close>
              <div
                className={cn("min-h-0 flex-1 overscroll-contain", className)}
                style={{
                  touchAction: "pan-y",
                  maxHeight: expandable ? "calc(97dvh - var(--snap-point-height, 0px))" : undefined,
                }}
                onScrollCapture={(event) => {
                  if (expandable) {
                    expandSheetBeforeScroll(event.target as HTMLElement, fullHeight, () =>
                      setActiveSnapPoint(1),
                    );
                  }
                }}
              >
                {children}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      );
    }

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={ref}
          className={cn(sheetVariants({ side }), className)}
          {...props}
        >
          {/* Se dialog.tsx: 44px trykkflate, 16px ikon, negativ margin for å beholde
          den optiske plasseringen inne i p-6. */}
          <SheetPrimitive.Close className={closeButtonClass}>
            <X className="h-4 w-4" />
            <span className="sr-only">Lukk</span>
          </SheetPrimitive.Close>
          {children}
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
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
