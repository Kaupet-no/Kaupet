import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, X } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

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
import {
  adminListPendingVehicleEntries,
  adminApproveVehicleBrand,
  adminRejectVehicleBrand,
  adminApproveVehicleModel,
  adminRejectVehicleModel,
} from "@/lib/admin-vehicle-brands.functions";
import { formatErrorMessage } from "@/lib/errors";

type PendingRow = {
  kind: string;
  id: string;
  name: string;
  category_group: string;
  brand_name: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  created_at: string;
};

export function VehicleBrandsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPendingVehicleEntries);
  const approveBrandFn = useServerFn(adminApproveVehicleBrand);
  const rejectBrandFn = useServerFn(adminRejectVehicleBrand);
  const approveModelFn = useServerFn(adminApproveVehicleModel);
  const rejectModelFn = useServerFn(adminRejectVehicleModel);

  const {
    data: entries,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ["admin-pending-vehicle-entries"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-pending-vehicle-entries"] });

  const approveMut = useMutation({
    mutationFn: (row: PendingRow) =>
      row.kind === "brand"
        ? approveBrandFn({ data: { id: row.id } })
        : approveModelFn({ data: { id: row.id } }),
    onSuccess: () => {
      showSuccessToast("Godkjent");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke godkjenne")),
  });

  const rejectMut = useMutation({
    mutationFn: (row: PendingRow) =>
      row.kind === "brand"
        ? rejectBrandFn({ data: { id: row.id } })
        : rejectModelFn({ data: { id: row.id } }),
    onSuccess: () => {
      showSuccessToast("Avslått");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke avslå")),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        <p className="font-medium">Kunne ikke laste ventende kjøretøymerker/-modeller</p>
        <p className="mt-1 font-mono text-xs opacity-80">
          {queryError instanceof Error ? queryError.message : String(queryError)}
        </p>
      </div>
    );
  }

  const rows = (entries ?? []) as PendingRow[];
  const pending = approveMut.isPending || rejectMut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Ventende kjøretøymerker/-modeller{" "}
          {rows.length > 0 && (
            <Badge variant="destructive" className="ml-1">
              {rows.length}
            </Badge>
          )}
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen ventende forslag
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Navn</TableHead>
                <TableHead>Merke / kategori</TableHead>
                <TableHead>Foreslått av</TableHead>
                <TableHead>Dato</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell>
                    <Badge variant="outline">{r.kind === "brand" ? "Merke" : "Modell"}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.kind === "model" ? r.brand_name : r.category_group}
                  </TableCell>
                  <TableCell className="text-sm">{r.submitted_by_name ?? "Ukjent"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("nb-NO", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={pending}
                      onClick={() => approveMut.mutate(r)}
                    >
                      <Check className="size-3.5" />
                      Godkjenn
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => rejectMut.mutate(r)}
                    >
                      <X className="size-3.5" />
                      Avslå
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
