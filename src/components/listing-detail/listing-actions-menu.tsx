import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreVertical, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  submitReport,
  adminDisableListingWithMessage,
  adminDeleteListing,
} from "@/lib/admin-moderation.functions";

const REPORT_REASONS = [
  "Upassende innhold",
  "Misvisende beskrivelse",
  "Feil kategori",
  "Mistenkelig aktivitet / mulig svindel",
  "Spam / duplikat annonse",
  "Ulovlig vare eller tjeneste",
  "Annet",
] as const;

type Props = {
  listingId: string;
  listingTitle: string;
  isAdminOrModerator: boolean;
};

type ConfirmAction = "disable" | "delete";

export function ListingActionsMenu({ listingId, listingTitle, isAdminOrModerator }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submitFn = useServerFn(submitReport);
  const disableFn = useServerFn(adminDisableListingWithMessage);
  const deleteFn = useServerFn(adminDeleteListing);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminReason, setAdminReason] = useState("");

  const reportMut = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          listingId,
          reason: reportReason,
          comment: reportComment || undefined,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Rapporten er sendt inn");
      setReportOpen(false);
      setReportReason("");
      setReportComment("");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke sende inn rapporten")),
  });

  const disableMut = useMutation({
    mutationFn: () =>
      disableFn({
        data: {
          id: listingId,
          reason: adminReason || "Avpublisert av moderator",
          message: adminMessage,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Annonsen er avpublisert");
      setConfirmAction(null);
      setAdminMessage("");
      setAdminReason("");
      qc.invalidateQueries({ queryKey: ["listing"] });
      navigate({ to: "/admin/moderasjon" });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke avpublisere annonsen")),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      deleteFn({
        data: { id: listingId, message: adminMessage },
      }),
    onSuccess: () => {
      showSuccessToast("Annonsen er slettet");
      setConfirmAction(null);
      setAdminMessage("");
      qc.invalidateQueries({ queryKey: ["listing"] });
      navigate({ to: "/admin/moderasjon" });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette annonsen")),
  });

  const isPending = disableMut.isPending || deleteMut.isPending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Flere valg">
            <MoreVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>
            Rapporter annonse
          </DropdownMenuItem>
          {isAdminOrModerator && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setAdminMessage("");
                  setAdminReason("");
                  setConfirmAction("disable");
                }}
              >
                Avpubliser annonse
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setAdminMessage("");
                  setConfirmAction("delete");
                }}
              >
                Slett annonse
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={(o) => !reportMut.isPending && setReportOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rapporter annonse</DialogTitle>
            <DialogDescription>
              Beskriv hva du mener er galt med annonsen «{listingTitle}». Rapporten vil bli
              gjennomgått av moderatorene våre.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-reason">Grunn</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger id="report-reason">
                  <SelectValue placeholder="Velg en grunn…" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-comment">Kommentar (valgfri)</Label>
              <Textarea
                id="report-comment"
                placeholder="Legg til mer informasjon om hva du reagerer på…"
                value={reportComment}
                onChange={(e) => setReportComment(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReportOpen(false)}
              disabled={reportMut.isPending}
            >
              Avbryt
            </Button>
            <Button
              onClick={() => reportMut.mutate()}
              disabled={!reportReason || reportMut.isPending}
            >
              {reportMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Send inn rapport
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable confirmation */}
      <AlertDialog
        open={confirmAction === "disable"}
        onOpenChange={(o) => !isPending && !o && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avpubliser annonse?</AlertDialogTitle>
            <AlertDialogDescription>
              Annonsen «{listingTitle}» vil bli skjult for alle brukere. Eier av annonsen vil motta
              meldingen du skriver nedenfor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="disable-reason">Intern begrunnelse</Label>
              <Textarea
                id="disable-reason"
                placeholder="Begrunnelse (loggføres internt)…"
                value={adminReason}
                onChange={(e) => setAdminReason(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disable-message">Melding til eier (påkrevd)</Label>
              <Textarea
                id="disable-message"
                placeholder="Beskriv årsaken til avpubliseringen…"
                value={adminMessage}
                onChange={(e) => setAdminMessage(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending || !adminMessage.trim()}
              onClick={(e) => {
                e.preventDefault();
                disableMut.mutate();
              }}
            >
              {disableMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Avpubliser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={confirmAction === "delete"}
        onOpenChange={(o) => !isPending && !o && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett annonse?</AlertDialogTitle>
            <AlertDialogDescription>
              Annonsen «{listingTitle}» vil bli permanent slettet. Denne handlingen kan ikke angres.
              Eier av annonsen vil motta meldingen du skriver nedenfor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="delete-message">Melding til eier (påkrevd)</Label>
            <Textarea
              id="delete-message"
              placeholder="Beskriv årsaken til slettingen…"
              value={adminMessage}
              onChange={(e) => setAdminMessage(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending || !adminMessage.trim()}
              onClick={(e) => {
                e.preventDefault();
                deleteMut.mutate();
              }}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Slett permanent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
