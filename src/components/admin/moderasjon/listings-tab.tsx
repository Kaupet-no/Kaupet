import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Loader2, Search } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { adminDisableListing, adminEnableListing } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";

export function ListingsTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = useState("");

  const disableFn = useServerFn(adminDisableListing);
  const enableFn = useServerFn(adminEnableListing);

  const search = useQuery({
    queryKey: ["admin-listings", q, status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_listings", {
        _query: q,
        _status: status === "all" ? undefined : status,
        _limit: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const disableMut = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      disableFn({ data: { id: v.id, reason: v.reason } }),
    onSuccess: () => {
      showSuccessToast("Annonsen er deaktivert");
      setConfirm(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-listings"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke deaktivere annonsen")),
  });
  const enableMut = useMutation({
    mutationFn: (id: string) => enableFn({ data: { id } }),
    onSuccess: () => {
      showSuccessToast("Annonsen er aktivert");
      qc.invalidateQueries({ queryKey: ["admin-listings"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke aktivere annonsen")),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Søk i annonsetitler…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="active">Aktive</option>
            <option value="disabled">Deaktiverte</option>
            <option value="sold">Solgt</option>
            <option value="archived">Arkivert</option>
            <option value="expired">Utløpt</option>
            <option value="draft">Utkast</option>
            <option value="all">Alle</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tittel</TableHead>
                <TableHead>Selger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Handling</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {search.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : (search.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Ingen treff
                  </TableCell>
                </TableRow>
              ) : (
                (
                  search.data as Array<{
                    id: string;
                    kaupet_code: string;
                    title: string;
                    status: string;
                    seller_id: string;
                    seller_name: string | null;
                  }>
                ).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link
                        to="/$kaupetCode"
                        params={{ kaupetCode: l.kaupet_code }}
                        className="font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link
                        to="/bruker/$id"
                        params={{ id: l.seller_id }}
                        className="hover:underline"
                      >
                        {l.seller_name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.status === "active" ? "default" : "secondary"}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {l.status === "disabled" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => enableMut.mutate(l.id)}
                          disabled={enableMut.isPending}
                        >
                          Aktiver
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirm({ id: l.id, title: l.title })}
                        >
                          <Ban className="size-4" /> Deaktiver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deaktiver annonse</DialogTitle>
            <DialogDescription>«{confirm?.title}»</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Begrunnelse</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brudd på retningslinjer, ulovlig innhold osv."
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              disabled={disableMut.isPending || reason.trim().length === 0}
              onClick={() =>
                confirm && disableMut.mutate({ id: confirm.id, reason: reason.trim() })
              }
            >
              {disableMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Deaktiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
