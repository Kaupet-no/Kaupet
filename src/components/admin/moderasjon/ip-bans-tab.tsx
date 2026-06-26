import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { adminBanIp, adminUnbanIp } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";

export function IpBansTab() {
  const qc = useQueryClient();
  const banFn = useServerFn(adminBanIp);
  const unbanFn = useServerFn(adminUnbanIp);
  const [open, setOpen] = useState(false);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ip-bans"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_ip_bans");
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = useMutation({
    mutationFn: () =>
      banFn({
        data: {
          ip: ip.trim(),
          reason: reason.trim(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      showSuccessToast("IP-adressen er sperret");
      setOpen(false);
      setIp("");
      setReason("");
      setExpiresAt("");
      qc.invalidateQueries({ queryKey: ["admin-ip-bans"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke sperre IP-adressen")),
  });
  const unban = useMutation({
    mutationFn: (id: string) => unbanFn({ data: { id } }),
    onSuccess: () => {
      showSuccessToast("IP-sperre opphevet");
      qc.invalidateQueries({ queryKey: ["admin-ip-bans"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppheve IP-sperren")),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Sperr IP-adresse
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sperr IP-adresse</DialogTitle>
              <DialogDescription>
                Alle forespørsler fra denne IP-en vil få 403. La utløp stå tom for permanent sperre.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="ip">IP-adresse</Label>
                <Input
                  id="ip"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="f.eks. 203.0.113.42"
                />
              </div>
              <div>
                <Label htmlFor="ip-reason">Begrunnelse</Label>
                <Textarea
                  id="ip-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
              </div>
              <div>
                <Label htmlFor="ip-expires">Utløper (valgfritt)</Label>
                <Input
                  id="ip-expires"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Avbryt
              </Button>
              <Button
                disabled={create.isPending || ip.trim().length === 0 || reason.trim().length === 0}
                onClick={() => create.mutate()}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />} Sperr
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>Begrunnelse</TableHead>
                <TableHead>Utløper</TableHead>
                <TableHead className="text-right">Handling</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : (data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Ingen IP-sperrer
                  </TableCell>
                </TableRow>
              ) : (
                (
                  data as Array<{
                    id: string;
                    ip_address: string;
                    reason: string;
                    expires_at: string | null;
                  }>
                ).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono">{b.ip_address}</TableCell>
                    <TableCell className="text-muted-foreground">{b.reason}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.expires_at ? new Date(b.expires_at).toLocaleString("nb-NO") : "Permanent"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => unban.mutate(b.id)}
                        disabled={unban.isPending}
                      >
                        <Trash2 className="size-4" /> Opphev
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
