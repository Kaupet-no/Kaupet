import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DiscardListingDialogProps {
  open: boolean;
  onReset: () => void;
  onDiscard: () => void | Promise<void>;
  /** Must resolve `true` only if the draft was actually persisted. */
  onSaveDraft: () => Promise<boolean>;
  isSavingDraft: boolean;
  saveDraftLabel?: string;
}

/**
 * Shared "avbryte annonsen"-dialog for annonseopprettelse (både salgs- og
 * ønskes kjøpt-flyten). Bruker vanlig Button i stedet for AlertDialogAction
 * fordi AlertDialogAction lukker dialogen synkront på klikk, noe som løper
 * fra async onDiscard/onSaveDraft-kall og kansellerer blocker.proceed().
 *
 * onSaveDraft sin returverdi avgjør navigasjonen: begge
 * autosave-hookene (useDraftAutosave/useWtbDraftAutosave) svelger
 * nettverksfeil og returnerer null uten å kaste, så uten denne sjekken ville
 * brukeren navigert bort og trodd kladden var lagret selv om den ikke var det.
 */
export function DiscardListingDialog({
  open,
  onReset,
  onDiscard,
  onSaveDraft,
  isSavingDraft,
  saveDraftLabel = "Lagre som kladd",
}: DiscardListingDialogProps) {
  const [saveFailed, setSaveFailed] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSaveFailed(false);
          onReset();
        }
      }}
    >
      <AlertDialogContent
        onClickOutside={() => {
          setSaveFailed(false);
          onReset();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Avbryte annonsen?</AlertDialogTitle>
          <AlertDialogDescription>
            Vil du lagre annonsen som kladd og fortsette senere, eller forkaste den?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
          {saveFailed && (
            <p role="alert" className="text-sm text-destructive">
              Kunne ikke lagre utkastet. Sjekk nettforbindelsen og prøv igjen, eller forkast
              annonsen.
            </p>
          )}
          <Button
            className="h-14 w-full bg-secondary text-destructive hover:bg-secondary/80"
            onClick={() => void onDiscard()}
          >
            Forkast annonse
          </Button>
          <Button
            className="h-14 w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
            disabled={isSavingDraft}
            onClick={async () => {
              setSaveFailed(false);
              const saved = await onSaveDraft();
              if (!saved) setSaveFailed(true);
            }}
          >
            {isSavingDraft ? "Lagrer…" : saveDraftLabel}
          </Button>
          <Button
            variant="ghost"
            className="h-14 w-full border-0 bg-secondary text-secondary-foreground hover:bg-secondary/80"
            onClick={() => {
              setSaveFailed(false);
              onReset();
            }}
          >
            Fortsett å redigere
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
