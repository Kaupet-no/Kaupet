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
  ReportDialog,
  LISTING_REPORT_REASONS,
  USER_REPORT_REASONS,
} from "@/components/report-dialog";
import {
  submitReport,
  submitUserReport,
  adminDisableListingWithMessage,
  adminDeleteListing,
} from "@/lib/admin-moderation.functions";

type Props = {
  listingId: string;
  listingTitle: string;
  sellerId: string;
  isAdminOrModerator: boolean;
};

type ConfirmAction = "disable" | "delete";

export function ListingActionsMenu({
  listingId,
  listingTitle,
  sellerId,
  isAdminOrModerator,
}: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submitFn = useServerFn(submitReport);
  const submitUserFn = useServerFn(submitUserReport);
  const disableFn = useServerFn(adminDisableListingWithMessage);
  const deleteFn = useServerFn(adminDeleteListing);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");

  const [userReportOpen, setUserReportOpen] = useState(false);
  const [userReportReason, setUserReportReason] = useState("");
  const [userReportComment, setUserReportComment] = useState("");

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

  const userReportMut = useMutation({
    mutationFn: () =>
      submitUserFn({
        data: {
          reportedUserId: sellerId,
          reason: userReportReason,
          comment: userReportComment || undefined,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Rapporten er sendt inn");
      setUserReportOpen(false);
      setUserReportReason("");
      setUserReportComment("");
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
          <DropdownMenuItem onSelect={() => setUserReportOpen(true)}>
            Rapporter bruker
          </DropdownMenuItem>
          {isAdminOrModerator && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                onSelect={() => {
                  setAdminMessage("");
                  setAdminReason("");
                  setConfirmAction("disable");
                }}
              >
                Avpubliser annonse
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
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
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        title="Rapporter annonse"
        description={`Beskriv hva du mener er galt med annonsen «${listingTitle}». Rapporten vil bli gjennomgått av moderatorene våre.`}
        reasons={LISTING_REPORT_REASONS}
        reason={reportReason}
        onReasonChange={setReportReason}
        comment={reportComment}
        onCommentChange={setReportComment}
        onSubmit={() => reportMut.mutate()}
        pending={reportMut.isPending}
      />

      {/* Report user dialog */}
      <ReportDialog
        open={userReportOpen}
        onOpenChange={setUserReportOpen}
        title="Rapporter bruker"
        description="Beskriv hva du mener er galt med denne brukeren. Rapporten vil bli gjennomgått av moderatorene våre."
        reasons={USER_REPORT_REASONS}
        reason={userReportReason}
        onReasonChange={setUserReportReason}
        comment={userReportComment}
        onCommentChange={setUserReportComment}
        onSubmit={() => userReportMut.mutate()}
        pending={userReportMut.isPending}
      />

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
