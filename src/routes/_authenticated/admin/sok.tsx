import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/sok")({
  head: () => ({ meta: [{ title: "Søkestatistikk — Kaupet.no" }] }),
  component: SearchStatsPage,
});

function SearchStatsPage() {
  const zeroResults = useQuery({
    queryKey: ["admin", "zero-result-searches"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_zero_result_searches", { _limit: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl tracking-tight">Søk uten treff</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Søketekster som har gitt null treff minst én gang, sortert etter flest nulltreff. Brukes
          til å finne gjenkjenning som mangler i søkepipelinen (bindeord, merker, utstyr...).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nulltreff-søk</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Søketekst</TableHead>
                <TableHead className="text-right">Nulltreff</TableHead>
                <TableHead className="text-right">Totalt søkt</TableHead>
                <TableHead className="text-right">Sist søkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zeroResults.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : zeroResults.data && zeroResults.data.length > 0 ? (
                zeroResults.data.map((row) => (
                  <TableRow key={row.query}>
                    <TableCell className="font-medium">{row.query}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.zero_result_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.search_count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(row.last_searched_at).toLocaleDateString("nb-NO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Ingen nulltreff-søk registrert ennå
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
