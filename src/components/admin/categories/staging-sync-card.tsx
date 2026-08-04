import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCategorySyncDiff,
  getCategorySyncStatus,
  syncCategoriesFromStaging,
} from "@/lib/category-sync.functions";

const TABLE_LABELS = {
  categories: "Kategorier",
  categoryFilters: "Filtre",
  categoryFlows: "Annonseflyter",
  filterSynonyms: "Filter-synonymer",
} as const;

function describeCategoryRow(row: Record<string, unknown>) {
  return String(row.name_nb ?? row.label_nb ?? row.phrase ?? row.slug ?? row.key ?? row.id ?? "");
}

function formatDate(iso: string | null) {
  if (!iso) return "aldri";
  return new Date(iso).toLocaleString("nb-NO", { dateStyle: "medium", timeStyle: "short" });
}

export function StagingSyncCard() {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["admin", "category-sync-status"],
    queryFn: () => getCategorySyncStatus(),
    staleTime: 30_000,
  });

  const diffQuery = useQuery({
    queryKey: ["admin", "category-sync-diff"],
    queryFn: () => getCategorySyncDiff(),
    enabled: confirmOpen,
  });

  const syncMutation = useMutation({
    mutationFn: () => syncCategoriesFromStaging(),
    onSuccess: () => {
      showSuccessToast("Kategorier synkronisert fra staging");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      qc.invalidateQueries({ queryKey: ["admin", "category-counts"] });
      qc.invalidateQueries({ queryKey: ["admin", "site-settings"] });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
      qc.invalidateQueries({ queryKey: ["admin", "category-sync-status"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke synkronisere")),
  });

  const diff = diffQuery.data;
  const totals = diff
    ? {
        added:
          diff.categories.added.length +
          diff.categoryFilters.added.length +
          diff.categoryFlows.added.length +
          diff.filterSynonyms.added.length,
        updated:
          diff.categories.updated.length +
          diff.categoryFilters.updated.length +
          diff.categoryFlows.updated.length +
          diff.filterSynonyms.updated.length +
          (diff.defaultSearchExamplesChanged ? 1 : 0),
        removed:
          diff.categories.removed.length +
          diff.categoryFilters.removed.length +
          diff.categoryFlows.removed.length +
          diff.filterSynonyms.removed.length,
      }
    : null;
  const hasChanges = totals ? totals.added + totals.updated + totals.removed > 0 : null;

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            {statusQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : statusQuery.isError ? (
              <Badge variant="destructive">Kunne ikke sjekke status</Badge>
            ) : statusQuery.data?.inSync ? (
              <CheckCircle2 className="size-5 text-green-600" />
            ) : (
              <RefreshCw className="size-5 text-amber-600" />
            )}
            <div className="text-sm">
              <p className="font-medium">
                {statusQuery.isLoading
                  ? "Sjekker status…"
                  : statusQuery.isError
                    ? formatErrorMessage(statusQuery.error, "Kunne ikke sjekke synk-status")
                    : statusQuery.data?.inSync
                      ? "Synkronisert med staging"
                      : "Endringer venter i staging"}
              </p>
              {statusQuery.data && (
                <p className="text-xs text-muted-foreground">
                  Sist synkronisert: {formatDate(statusQuery.data.lastSyncedAt)}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className="size-4" /> Synkroniser fra staging
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Synkroniser kategorier fra staging?</DialogTitle>
            <DialogDescription>
              Dette erstatter kategorier, filtre, annonseflyter, filter-synonymer og standard
              søkeord i produksjon med staging sitt innhold. Rader som ikke finnes i staging lenger,
              blir slettet.
            </DialogDescription>
          </DialogHeader>

          {diffQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Sammenligner staging og produksjon…
            </div>
          ) : diffQuery.isError ? (
            <p className="py-6 text-sm text-destructive">
              {formatErrorMessage(diffQuery.error, "Kunne ikke hente endringer")}
            </p>
          ) : !hasChanges ? (
            <p className="py-6 text-sm text-muted-foreground">
              Ingen endringer å synkronisere — produksjon matcher allerede staging.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2 text-sm">
                <Badge variant="secondary">{totals!.added} lagt til</Badge>
                <Badge variant="secondary">{totals!.updated} endret</Badge>
                <Badge variant="destructive">{totals!.removed} slettet</Badge>
              </div>
              <ScrollArea className="h-72 rounded-md border p-3">
                <div className="space-y-4">
                  {(Object.keys(TABLE_LABELS) as (keyof typeof TABLE_LABELS)[]).map((key) => {
                    const d = diff![key];
                    if (d.added.length + d.updated.length + d.removed.length === 0) return null;
                    return (
                      <div key={key}>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          {TABLE_LABELS[key]}
                        </p>
                        <ul className="mt-1 space-y-1 text-sm">
                          {d.added.map((row) => (
                            <li key={`add-${row.id}`} className="text-green-700">
                              + Lagt til: {describeCategoryRow(row)}
                            </li>
                          ))}
                          {d.updated.map(({ before, after }) => (
                            <li key={`upd-${after.id}`} className="text-amber-700">
                              ~ Endret: {describeCategoryRow(after) || describeCategoryRow(before)}
                            </li>
                          ))}
                          {d.removed.map((row) => (
                            <li key={`del-${row.id}`} className="text-destructive">
                              − Slettet: {describeCategoryRow(row)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  {diff?.defaultSearchExamplesChanged && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Standard søkeord
                      </p>
                      <p className="mt-1 text-sm text-amber-700">~ Endret</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Avbryt
            </Button>
            <Button
              disabled={!hasChanges || diffQuery.isLoading || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Synkroniser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
