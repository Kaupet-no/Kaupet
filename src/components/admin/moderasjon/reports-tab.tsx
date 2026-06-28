import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle, ExternalLink, Loader2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminResolveReport } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";

type ReportRow = {
  id: string;
  created_at: string;
  listing_id: string | null;
  kaupet_code: string | null;
  listing_title: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  reason: string | null;
  comment: string | null;
  status: string | null;
  resolved_at: string | null;
};

export function ReportsTab() {
  const qc = useQueryClient();
  const resolveFn = useServerFn(adminResolveReport);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_reports", { _limit: 200 });
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { id } }),
    onSuccess: () => {
      showSuccessToast("Rapporten er markert som løst");
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke løse rapporten")),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const open = reports?.filter((r) => r.status !== "resolved") ?? [];
  const resolved = reports?.filter((r) => r.status === "resolved") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Åpne varsler{" "}
          {open.length > 0 && (
            <Badge variant="destructive" className="ml-1">
              {open.length}
            </Badge>
          )}
        </h2>
      </div>

      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen åpne varsler
        </p>
      ) : (
        <ReportsTable
          reports={open}
          onResolve={(id) => resolveMut.mutate(id)}
          resolving={resolveMut.isPending}
        />
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-muted-foreground">Løste varsler</h2>
          <ReportsTable reports={resolved} />
        </>
      )}
    </div>
  );
}

function ReportsTable({
  reports,
  onResolve,
  resolving,
}: {
  reports: ReportRow[];
  onResolve?: (id: string) => void;
  resolving?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dato</TableHead>
            <TableHead>Innmelder</TableHead>
            <TableHead>Grunn / kommentar</TableHead>
            <TableHead>Annonseeier</TableHead>
            <TableHead>Annonse</TableHead>
            <TableHead>Status</TableHead>
            {onResolve && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString("nb-NO", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell className="text-sm">{r.reporter_name ?? "Ukjent"}</TableCell>
              <TableCell className="max-w-xs text-sm">
                <span className="font-medium">{r.reason}</span>
                {r.comment && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.comment}</p>
                )}
              </TableCell>
              <TableCell className="text-sm">{r.owner_name ?? "Ukjent"}</TableCell>
              <TableCell>
                {r.kaupet_code ? (
                  <Link
                    to="/$kaupetCode"
                    params={{ kaupetCode: r.kaupet_code }}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {r.listing_title ?? r.kaupet_code}
                    <ExternalLink className="size-3" />
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Annonse slettet</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={r.status === "resolved" ? "secondary" : "outline"}>
                  {r.status === "resolved" ? "Løst" : "Åpen"}
                </Badge>
              </TableCell>
              {onResolve && (
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    disabled={resolving}
                    onClick={() => onResolve(r.id)}
                  >
                    {resolving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="size-3.5" />
                    )}
                    Merk løst
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
