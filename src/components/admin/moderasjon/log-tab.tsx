import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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

export function LogTab() {
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
