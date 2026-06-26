import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Loader2, ShieldOff } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { listMyBlocks, deleteBlock } from "@/lib/blocks.functions";
import { formatErrorMessage } from "@/lib/errors";

export function BlockedSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyBlocks);
  const deleteFn = useServerFn(deleteBlock);

  const { data: blocks, isLoading } = useQuery({
    queryKey: ["my-blocks"],
    queryFn: () => listFn(),
  });

  const unblock = useMutation({
    mutationFn: async (blockId: string) => deleteFn({ data: { blockId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-blocks"] });
      showSuccessToast("Blokkering opphevet");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppheve blokkeringen")),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 overflow-hidden rounded-xl border border-border bg-card p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex animate-pulse items-center gap-3">
            <div className="size-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-1/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!blocks || blocks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
        Du har ikke blokkert noen brukere eller samtaler.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Brukere og samtaler du har blokkert. Opphev blokkeringen for å kunne sende og motta
        meldinger igjen.
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {blocks.map((b) => (
          <li key={b.id} className="flex items-center gap-3 p-4">
            <Avatar className="size-10">
              {b.blocked_profile?.avatar_url && (
                <AvatarImage
                  src={b.blocked_profile.avatar_url}
                  alt={b.blocked_profile.display_name ?? ""}
                />
              )}
              <AvatarFallback className="bg-muted text-xs">
                {(b.blocked_profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {b.blocked_profile?.display_name ?? "Ukjent bruker"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {b.scope === "all"
                  ? "All kommunikasjon blokkert"
                  : `Samtale blokkert${b.listing ? ` · ${b.listing.title}` : ""}`}
                {" · "}
                {new Date(b.created_at).toLocaleDateString("nb-NO", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={unblock.isPending}
              onClick={() => unblock.mutate(b.id)}
              className="gap-2"
            >
              {unblock.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldOff className="size-4" />
              )}
              Opphev
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
