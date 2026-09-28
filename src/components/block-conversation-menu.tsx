import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreVertical, ShieldOff, Loader2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { createBlock, deleteBlock, listMyBlocks, type BlockRow } from "@/lib/blocks.functions";
import { submitUserReport } from "@/lib/admin-moderation.functions";
import { ReportDialog, USER_REPORT_REASONS } from "@/components/report-dialog";
import { formatErrorMessage } from "@/lib/errors";

type Props = {
  targetUserId: string;
  conversationId: string;
  targetName: string;
};

type ActiveBlock = { kind: "all" | "conversation"; row: BlockRow } | null;

export function BlockConversationMenu({ targetUserId, conversationId, targetName }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyBlocks);
  const createFn = useServerFn(createBlock);
  const deleteFn = useServerFn(deleteBlock);
  const reportFn = useServerFn(submitUserReport);

  const { data: blocks } = useQuery({
    queryKey: ["my-blocks"],
    queryFn: () => listFn(),
  });

  const active: ActiveBlock = (() => {
    if (!blocks) return null;
    const all = blocks.find((b) => b.scope === "all" && b.blocked_id === targetUserId);
    if (all) return { kind: "all", row: all };
    const conv = blocks.find(
      (b) => b.scope === "conversation" && b.conversation_id === conversationId,
    );
    if (conv) return { kind: "conversation", row: conv };
    return null;
  })();

  const [confirm, setConfirm] = useState<null | "all" | "conversation">(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");

  const blockMut = useMutation({
    mutationFn: async (scope: "all" | "conversation") =>
      createFn({
        data: {
          targetUserId,
          scope,
          conversationId: scope === "conversation" ? conversationId : undefined,
        },
      }),
    onSuccess: (_, scope) => {
      qc.invalidateQueries({ queryKey: ["my-blocks"] });
      showSuccessToast(scope === "all" ? `${targetName} er blokkert` : "Samtalen er blokkert");
      setConfirm(null);
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke blokkere brukeren")),
  });

  const unblockMut = useMutation({
    mutationFn: async (blockId: string) => deleteFn({ data: { blockId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-blocks"] });
      showSuccessToast("Blokkering opphevet");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppheve blokkeringen")),
  });

  const reportMut = useMutation({
    mutationFn: () =>
      reportFn({
        data: {
          reportedUserId: targetUserId,
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

  const reportDialog = (
    <ReportDialog
      open={reportOpen}
      onOpenChange={setReportOpen}
      title="Rapporter bruker"
      description="Fortell oss hvorfor du rapporterer denne brukeren."
      reasons={USER_REPORT_REASONS}
      reason={reportReason}
      onReasonChange={setReportReason}
      comment={reportComment}
      onCommentChange={setReportComment}
      onSubmit={() => reportMut.mutate()}
      pending={reportMut.isPending}
    />
  );

  if (active) {
    return (
      <>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => unblockMut.mutate(active.row.id)}
            disabled={unblockMut.isPending}
          >
            {unblockMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldOff className="size-4" />
            )}
            Opphev blokkering
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setReportOpen(true)}
          >
            Rapporter bruker
          </Button>
        </div>
        {reportDialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Flere valg">
            <MoreVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Blokker</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setConfirm("conversation")}>
            Blokker denne samtalen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirm("all")}
          >
            Blokker brukeren helt
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>Rapporter bruker</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {reportDialog}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "all" ? `Blokker ${targetName}?` : "Blokker denne samtalen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "all"
                ? "Dere vil ikke kunne sende meldinger til hverandre i noen samtaler eller starte nye samtaler. Du kan oppheve blokkeringen senere fra profilen din."
                : "Ingen av dere kan sende flere meldinger i denne samtalen. Andre samtaler mellom dere påvirkes ikke. Du kan oppheve blokkeringen senere fra profilen din."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={blockMut.isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={blockMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) blockMut.mutate(confirm);
              }}
            >
              {blockMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Blokker
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
