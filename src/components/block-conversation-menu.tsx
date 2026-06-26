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

  if (active) {
    return (
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
        </DropdownMenuContent>
      </DropdownMenu>

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
