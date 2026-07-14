import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserX } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adminUnsuspendUser } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";
import { EmptyState } from "@/components/ui/empty-state";

export function SuspensionsTab() {
  const qc = useQueryClient();
  const unsuspendFn = useServerFn(adminUnsuspendUser);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
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
      showSuccessToast("Svarteliste opphevet");
      qc.invalidateQueries({ queryKey: ["admin-suspensions"] });
    },
    onError: (e: Error) =>
      showErrorToast(formatErrorMessage(e, "Kunne ikke oppheve svartelistingen")),
    onSettled: () => setTarget(null),
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
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <p className="text-sm text-destructive">
                    {formatErrorMessage(queryError, "Kunne ikke laste svartelistede brukere")}
                  </p>
                </TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8">
                  <EmptyState
                    icon={UserX}
                    title="Ingen svartelistede brukere"
                    description="Svartelistede brukere vises her."
                    className="border-none p-0"
                  />
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
                      onClick={() =>
                        setTarget({ id: s.user_id, name: s.display_name ?? s.user_id.slice(0, 8) })
                      }
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

      <AlertDialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Oppheve svartelistingen av {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Brukeren mister ikke lenger begrensningene fra svartelistingen. Dette kan ikke angres
              uten å svarteliste på nytt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => target && unsuspend.mutate(target.id)}>
              Opphev
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
