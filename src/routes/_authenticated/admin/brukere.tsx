import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Search, Shield, ShieldOff } from "lucide-react";
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
};

function AdminUsers() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ user: FoundUser; action: "grant" | "revoke" } | null>(
    null,
  );
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
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(input.trim());
            }}
            className="flex gap-2"
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
                        {u.is_admin ? (
                          <Badge>Administrator</Badge>
                        ) : (
                          <Badge variant="secondary">Bruker</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
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
              {pending?.action === "grant" ? "Tildele administratorrolle?" : "Fjerne administratorrolle?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "grant"
                ? `${pending.user.email} vil få full tilgang til administrasjonsgrensesnittet.`
                : `${pending?.user.email} vil miste tilgang til administrasjonsgrensesnittet.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pending) return;
                if (pending.action === "grant") grant.mutate(pending.user.user_id);
                else revoke.mutate(pending.user.user_id);
              }}
              disabled={grant.isPending || revoke.isPending}
            >
              {grant.isPending || revoke.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : pending?.action === "grant" ? (
                "Tildel"
              ) : (
                "Fjern"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
