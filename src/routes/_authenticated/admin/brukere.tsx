import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FlaskConical, Loader2, Plus, Search, Shield, ShieldOff } from "lucide-react";
import { CreateDemoUserDialog } from "@/components/create-demo-user-dialog";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/brukere")({
  head: () => ({ meta: [{ title: "Brukeradministrasjon — Kaupet.no" }] }),
  component: AdminUsers,
});

type FoundUser = {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  is_admin: boolean;
  is_demo: boolean;
};

type PendingAction = "grant" | "revoke" | "grant_demo" | "revoke_demo";

function AdminUsers() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ user: FoundUser; action: PendingAction } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  const search = useQuery({
    queryKey: ["admin", "users", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_find_users_by_email", { _query: query });
      if (error) throw error;
      return (data ?? []) as FoundUser[];
    },
  });

  const grant = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_grant_role", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Administratorrolle tildelt");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setPending(null);
    },
    onError: (e: Error) =>
      toast.error(formatErrorMessage(e, "Kunne ikke tildele administratorrollen")),
  });

  const revoke = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_revoke_role", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Administratorrolle fjernet");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setPending(null);
    },
    onError: (e: Error) =>
      toast.error(formatErrorMessage(e, "Kunne ikke fjerne administratorrollen")),
  });

  const grantDemo = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_grant_demo_role", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demo-tilgang tildelt");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setPending(null);
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke tildele demo-tilgang")),
  });

  const revokeDemo = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_revoke_demo_role", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demo-tilgang fjernet");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setPending(null);
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke fjerne demo-tilgang")),
  });

  const exportData = useMutation({
    mutationFn: async (user: FoundUser) => {
      const { data, error } = await supabase.rpc("admin_export_user_data", {
        _user_id: user.user_id,
      });
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeEmail = user.email.replace(/[^a-zA-Z0-9._-]/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `kaupet-innsyn-${safeEmail}-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("Brukerdata eksportert"),
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke eksportere brukerdata")),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(input.trim());
              }}
              className="flex flex-1 gap-2 min-w-[260px]"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Søk på e-postadresse…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" disabled={input.trim().length < 2}>
                Søk
              </Button>
            </form>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Opprett demo-bruker
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Skriv inn hele eller deler av en e-postadresse.
          </p>
        </CardContent>
      </Card>

      {query.length >= 2 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-post</TableHead>
                  <TableHead>Navn</TableHead>
                  <TableHead>Registrert</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead className="text-right">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {search.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : search.data && search.data.length > 0 ? (
                  search.data.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.display_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("nb-NO")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.is_admin ? (
                            <Badge>Administrator</Badge>
                          ) : (
                            <Badge variant="secondary">Bruker</Badge>
                          )}
                          {u.is_demo && <Badge variant="outline">Demo</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportData.mutate(u)}
                            disabled={exportData.isPending}
                            title="Last ned alle data vi har om denne brukeren (GDPR-innsyn)"
                          >
                            {exportData.isPending && exportData.variables?.user_id === u.user_id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Download className="size-4" />
                            )}
                            Eksporter data
                          </Button>
                          {u.is_demo ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPending({ user: u, action: "revoke_demo" })}
                            >
                              <FlaskConical className="size-4" /> Fjern demo
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPending({ user: u, action: "grant_demo" })}
                            >
                              <FlaskConical className="size-4" /> Gjør til demo
                            </Button>
                          )}
                          {u.is_admin ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPending({ user: u, action: "revoke" })}
                            >
                              <ShieldOff className="size-4" /> Fjern admin
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => setPending({ user: u, action: "grant" })}
                            >
                              <Shield className="size-4" /> Gjør til admin
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Ingen treff
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "grant"
                ? "Tildele administratorrolle?"
                : pending?.action === "revoke"
                  ? "Fjerne administratorrolle?"
                  : pending?.action === "grant_demo"
                    ? "Tildele demo-tilgang?"
                    : "Fjerne demo-tilgang?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "grant"
                ? `${pending.user.email} vil få full tilgang til administrasjonsgrensesnittet.`
                : pending?.action === "revoke"
                  ? `${pending?.user.email} vil miste tilgang til administrasjonsgrensesnittet.`
                  : pending?.action === "grant_demo"
                    ? `${pending.user.email} vil få tilgang til å teste nye funksjoner før de lanseres for ordinære brukere.`
                    : `${pending?.user.email} mister tilgang til demo-funksjoner.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pending) return;
                if (pending.action === "grant") grant.mutate(pending.user.user_id);
                else if (pending.action === "revoke") revoke.mutate(pending.user.user_id);
                else if (pending.action === "grant_demo")
                  grantDemo.mutate(pending.user.user_id);
                else revokeDemo.mutate(pending.user.user_id);
              }}
              disabled={
                grant.isPending ||
                revoke.isPending ||
                grantDemo.isPending ||
                revokeDemo.isPending
              }
            >
              {grant.isPending ||
              revoke.isPending ||
              grantDemo.isPending ||
              revokeDemo.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : pending?.action === "grant" || pending?.action === "grant_demo" ? (
                "Tildel"
              ) : (
                "Fjern"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateDemoUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(email) => {
          setInput(email);
          setQuery(email);
          qc.invalidateQueries({ queryKey: ["admin", "users"] });
        }}
      />
    </div>
  );
}
