import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldOff } from "lucide-react";
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
import { adminUnbanUser } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";

export function BansTab() {
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
