import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { cn } from "@/lib/utils";

export function AiImageInfo({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="contents" onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-auto min-h-12 whitespace-normal text-left text-xs", className)}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Info aria-hidden="true" />
        {children}
      </Button>
      {open && (
        <ResponsiveOverlay open={open} onOpenChange={setOpen}>
          <ResponsiveOverlayContent
            className="sm:max-w-md"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle>Merket som KI-generert</DialogTitle>
              <DialogDescription>
                Bildefilen oppgir at bildet er laget helt eller delvis med kunstig intelligens.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>Merkingen bygger på en KI-markør i bildefilens metadata, lest ved opplasting.</p>
              <p>
                Kaupet har ikke verifisert metadataene. Bilder uten merke kan også være laget eller
                endret med KI.
              </p>
            </div>
            <Button type="button" aria-label="Lukk forklaring" onClick={() => setOpen(false)}>
              Lukk
            </Button>
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      )}
    </div>
  );
}

export function AiImageBadge({ show, inline = false }: { show?: boolean; inline?: boolean }) {
  if (!show) return null;

  return (
    <AiImageInfo
      className={
        inline
          ? "justify-start px-0"
          : "absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary"
      }
    >
      Merket som KI
    </AiImageInfo>
  );
}
