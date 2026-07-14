import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Loader2, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatErrorMessage } from "@/lib/errors";

export function DeleteAccountSection({ currentEmail }: { currentEmail: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canConfirm =
    !!currentEmail && confirmation.trim().toLowerCase() === currentEmail.trim().toLowerCase();

  async function handleDelete() {
    if (!canConfirm) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("request_account_deletion", {
      _email: confirmation.trim(),
    });
    if (error) {
      setSubmitting(false);
      showErrorToast(formatErrorMessage(error, "Kunne ikke laste opp profilbildet"));
      return;
    }
    await supabase.auth.signOut();
    setSubmitting(false);
    setOpen(false);
    showSuccessToast(
      "Kontoen din er satt inaktiv. Den slettes permanent om 7 dager hvis du ikke logger inn igjen.",
    );
    navigate({ to: "/" });
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-medium text-destructive">Slett konto</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sletter kontoen din og dine personopplysninger. Annonsene dine fjernes helt. Tidligere
        meldinger du har sendt vil fortsatt være synlige for mottakerne, men avsendernavnet endres
        til «Slettet bruker». Av sikkerhetshensyn settes kontoen først inaktiv i 7 dager. Logger du
        inn igjen innen denne perioden, avbrytes slettingen automatisk. Etter 7 dager slettes
        kontoen permanent og kan ikke gjenopprettes.
      </p>
      <div className="mt-4 flex justify-end">
        <AlertDialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setConfirmation("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="size-4" /> Slett konto
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Er du sikker på at du vil slette kontoen?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Kontoen din blir satt inaktiv umiddelbart, og du logges ut. Alle dine annonser
                    arkiveres og blir ikke lenger synlige for andre.
                  </p>
                  <p>
                    Innen <strong>7 dager</strong> kan du gjenopprette kontoen ved å logge inn på
                    nytt. Etter 7 dager slettes profilen din permanent — annonsene dine fjernes, men
                    meldinger du har sendt blir værende hos mottakerne med avsendernavnet{" "}
                    <em>«Slettet bruker»</em>.
                  </p>
                  <p>
                    Skriv inn e-postadressen din (<strong>{currentEmail}</strong>) for å bekrefte:
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm-email" className="sr-only">
                Bekreft e-post
              </Label>
              <Input
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                placeholder="din@epost.no"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
                disabled={!canConfirm || submitting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Slett kontoen min
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
