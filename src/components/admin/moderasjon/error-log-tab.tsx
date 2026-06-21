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

export function ErrorLogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-error-log"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_error_log", { _limit: 100 });
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
              <TableHead>Funksjon</TableHead>
              <TableHead>Feilmelding</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead>Kontekst</TableHead>
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
                  Ingen feil registrert
                </TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString("nb-NO")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{e.function_name}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.error_message}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {e.error_code ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs max-w-xs truncate">
                    {e.context ? JSON.stringify(e.context) : "—"}
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
