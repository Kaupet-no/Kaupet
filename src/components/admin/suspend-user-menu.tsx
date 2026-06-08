import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Loader2, ShieldAlert, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsAdmin } from "@/lib/use-is-admin";
import {
  adminBanUser,
  adminSuspendUser,
} from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";

export function AdminUserActions({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const { data: isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [open, setOpen] = useState<null | "suspend" | "ban">(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(30);

  const suspendFn = useServerFn(adminSuspendUser);
  const banFn = useServerFn(adminBanUser);

  const suspendMut = useMutation({
    mutationFn: () =>
      suspendFn({ data: { userId, reason: reason.trim(), days } }),
    onSuccess: () => {
      toast.success(`${displayName} er svartelistet i ${days} dager`);
      setOpen(null);
      setReason("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke svarteliste brukeren")),
  });

  const banMut = useMutation({
    mutationFn: () => banFn({ data: { userId, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success(`${displayName} er permanent utestengt`);
      setOpen(null);
      setReason("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke utestenge brukeren")),
  });

  if (!isAdmin) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <ShieldAlert className="size-4" /> Admin
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Moderasjon</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setOpen("suspend")}>
            <Shield className="size-4" /> Svartelist (30 dager)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setOpen("ban")}
          >
            <Ban className="size-4" /> Utesteng permanent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open !== null} onOpenChange={(o) => { if (!o) { setOpen(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open === "ban" ? `Utesteng ${displayName}?` : `Svartelist ${displayName}?`}
            </DialogTitle>
            <DialogDescription>
              {open === "ban"
                ? "Brukeren mister tilgang til å opprette annonser, samtaler og meldinger. Aktive annonser blir deaktivert."
                : "Brukeren kan ikke opprette nye annonser eller sende meldinger i perioden. Aktive annonser blir deaktivert frem til svartelisten oppheves."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {open === "suspend" && (
              <div>
                <Label htmlFor="days">Antall dager</Label>
                <Input
                  id="days"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value) || 30)}
                />
              </div>
            )}
            <div>
              <Label htmlFor="mod-reason">Begrunnelse</Label>
              <Textarea
                id="mod-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Hva er årsaken?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>Avbryt</Button>
            <Button
              variant="destructive"
              disabled={
                reason.trim().length === 0 ||
                suspendMut.isPending ||
                banMut.isPending
              }
              onClick={() => (open === "ban" ? banMut.mutate() : suspendMut.mutate())}
            >
              {(suspendMut.isPending || banMut.isPending) && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Bekreft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
