import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";

import {
  adminDeleteFeedback,
  adminListFeedback,
  type AdminFeedbackRow,
} from "@/lib/admin-feedback.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/tilbakemeldinger")({
  head: () => ({ meta: [{ title: "Tilbakemeldinger — Admin — Kaupet.no" }] }),
  component: FeedbackAdminPage,
});

type SortBy = "created_at" | "type";

function SortIcon({ col, sortBy, ascending }: { col: SortBy; sortBy: SortBy; ascending: boolean }) {
  if (sortBy !== col) return null;
  return ascending ? (
    <ArrowUp className="ml-1 inline size-3.5" />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" />
  );
}

function formatFeedbackPagePath(url: string): string {
  try {
    const { pathname, search } = new URL(url);
    return `${pathname}${search}` || "/";
  } catch {
    return url;
  }
}

function FeedbackAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListFeedback);
  const deleteFn = useServerFn(adminDeleteFeedback);

  const [typeFilter, setTypeFilter] = useState<"alle" | "ris" | "ros">("alle");
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [ascending, setAscending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "feedback", typeFilter, sortBy, ascending],
    queryFn: () =>
      listFn({
        data: {
          typeFilter: typeFilter === "alle" ? null : typeFilter,
          sortBy,
          ascending,
        },
      }),
  });
  const rows: AdminFeedbackRow[] = useMemo(() => data?.rows ?? [], [data]);

  const del = useMutation({
    mutationFn: (ids: string[]) => deleteFn({ data: { ids } }),
    onSuccess: (_res, ids) => {
      showSuccessToast(
        ids.length === 1 ? "Tilbakemelding slettet" : `${ids.length} tilbakemeldinger slettet`,
      );
      setSelected(new Set());
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ["admin", "feedback"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette")),
  });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) setAscending((a) => !a);
    else {
      setSortBy(col);
      setAscending(col === "type");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">Tilbakemeldinger {data ? `(${data.total})` : ""}</h2>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle typer</SelectItem>
              <SelectItem value="ros">Ros</SelectItem>
              <SelectItem value="ris">Ris</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            disabled={selected.size === 0 || del.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            Slett valgte ({selected.size})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <EmptyState title="Ingen tilbakemeldinger" description="Ingen tilbakemeldinger å vise." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Velg alle"
                  />
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("type")} className="font-medium">
                    Type
                    <SortIcon col="type" sortBy={sortBy} ascending={ascending} />
                  </button>
                </TableHead>
                <TableHead>Melding</TableHead>
                <TableHead>Bruker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort("created_at")}
                    className="font-medium"
                  >
                    Dato
                    <SortIcon col="created_at" sortBy={sortBy} ascending={ascending} />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggleOne(r.id)}
                      aria-label="Velg rad"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.type === "ros" ? "default" : "destructive"}>
                      {r.type === "ros" ? "Ros" : "Ris"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap break-words text-sm">
                    {r.message}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.user_id ? (
                      <Link
                        to="/bruker/$id"
                        params={{ id: r.user_id }}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {r.display_name ?? "Bruker"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Anonym bruker</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[160px] text-sm">
                    {r.page_url ? (
                      <a
                        href={r.page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-primary underline-offset-2 hover:underline"
                        title={r.page_url}
                      >
                        {formatFeedbackPagePath(r.page_url)}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("nb-NO", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette {selected.size} tilbakemelding(er)?</AlertDialogTitle>
            <AlertDialogDescription>Dette kan ikke angres.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate([...selected])}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
