import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Ban, ShieldOff, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  adminDisableListing,
  adminEnableListing,
  adminUnbanUser,
  adminUnsuspendUser,
  adminBanIp,
  adminUnbanIp,
} from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/moderasjon")({
  head: () => ({ meta: [{ title: "Moderasjon — Kaupet.no" }] }),
  component: ModerationPage,
});

function ModerationPage() {
  return (
    <Tabs defaultValue="listings" className="space-y-6">
      <TabsList className="flex flex-wrap">
        <TabsTrigger value="listings">Annonser</TabsTrigger>
        <TabsTrigger value="bans">Utestengte</TabsTrigger>
        <TabsTrigger value="suspensions">Svartelistede</TabsTrigger>
        <TabsTrigger value="ips">IP-sperrer</TabsTrigger>
        <TabsTrigger value="log">Logg</TabsTrigger>
      </TabsList>
      <TabsContent value="listings">
        <ListingsTab />
      </TabsContent>
      <TabsContent value="bans">
        <BansTab />
      </TabsContent>
      <TabsContent value="suspensions">
        <SuspensionsTab />
      </TabsContent>
      <TabsContent value="ips">
        <IpBansTab />
      </TabsContent>
      <TabsContent value="log">
        <LogTab />
      </TabsContent>
    </Tabs>
  );
}

/* ───────────────────── Listings ───────────────────── */

function ListingsTab() {
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
      toast.success("Annonsen er deaktivert");
      setConfirm(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-listings"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke deaktivere annonsen")),
  });
  const enableMut = useMutation({
    mutationFn: (id: string) => enableFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Annonsen er aktivert");
      qc.invalidateQueries({ queryKey: ["admin-listings"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke aktivere annonsen")),
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
                    title: string;
                    status: string;
                    seller_id: string;
                    seller_name: string | null;
                  }>
                ).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link
                        to="/annonse/$id"
                        params={{ id: l.id }}
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

/* ───────────────────── Bans ───────────────────── */

function BansTab() {
  const qc = useQueryClient();
  const unbanFn = useServerFn(adminUnbanUser);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-bans"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_bans");
      if (error) throw error;
      return data ?? [];
    },
  });
  const unban = useMutation({
    mutationFn: (userId: string) => unbanFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Utestenging opphevet");
      qc.invalidateQueries({ queryKey: ["admin-bans"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke oppheve utestengingen")),
  });
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bruker</TableHead>
              <TableHead>Begrunnelse</TableHead>
              <TableHead>Utestengt</TableHead>
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
                  Ingen utestengte brukere
                </TableCell>
              </TableRow>
            ) : (
              (
                data as Array<{
                  user_id: string;
                  display_name: string | null;
                  reason: string;
                  created_at: string;
                }>
              ).map((b) => (
                <TableRow key={b.user_id}>
                  <TableCell>
                    <Link
                      to="/bruker/$id"
                      params={{ id: b.user_id }}
                      className="font-medium hover:underline"
                    >
                      {b.display_name ?? b.user_id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{b.reason}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString("nb-NO")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unban.mutate(b.user_id)}
                      disabled={unban.isPending}
                    >
                      <ShieldOff className="size-4" /> Opphev
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ───────────────────── Suspensions ───────────────────── */

function SuspensionsTab() {
  const qc = useQueryClient();
  const unsuspendFn = useServerFn(adminUnsuspendUser);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-suspensions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_suspensions");
      if (error) throw error;
      return data ?? [];
    },
  });
  const unsuspend = useMutation({
    mutationFn: (userId: string) => unsuspendFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Svarteliste opphevet");
      qc.invalidateQueries({ queryKey: ["admin-suspensions"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke oppheve svartelistingen")),
  });
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bruker</TableHead>
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
                  Ingen svartelistede brukere
                </TableCell>
              </TableRow>
            ) : (
              (
                data as Array<{
                  id: string;
                  user_id: string;
                  display_name: string | null;
                  reason: string;
                  expires_at: string;
                }>
              ).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      to="/bruker/$id"
                      params={{ id: s.user_id }}
                      className="font-medium hover:underline"
                    >
                      {s.display_name ?? s.user_id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.reason}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.expires_at).toLocaleString("nb-NO")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unsuspend.mutate(s.user_id)}
                      disabled={unsuspend.isPending}
                    >
                      Opphev
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ───────────────────── IP bans ───────────────────── */

function IpBansTab() {
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
      toast.success("IP-adressen er sperret");
      setOpen(false);
      setIp("");
      setReason("");
      setExpiresAt("");
      qc.invalidateQueries({ queryKey: ["admin-ip-bans"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke sperre IP-adressen")),
  });
  const unban = useMutation({
    mutationFn: (id: string) => unbanFn({ data: { id } }),
    onSuccess: () => {
      toast.success("IP-sperre opphevet");
      qc.invalidateQueries({ queryKey: ["admin-ip-bans"] });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke oppheve IP-sperren")),
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

/* ───────────────────── Log ───────────────────── */

function LogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-mod-log"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_moderation_log", { _limit: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tid</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Handling</TableHead>
              <TableHead>Mål</TableHead>
              <TableHead>Begrunnelse</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Ingen handlinger ennå
                </TableCell>
              </TableRow>
            ) : (
              (
                data as Array<{
                  id: string;
                  admin_name: string | null;
                  action: string;
                  target_type: string;
                  target_id: string | null;
                  reason: string | null;
                  created_at: string;
                }>
              ).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("nb-NO")}
                  </TableCell>
                  <TableCell>{l.admin_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{l.action}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {l.target_type}: {l.target_id?.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.reason ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
