import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { adminUnsuspendUser } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";

export function SuspensionsTab() {
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
