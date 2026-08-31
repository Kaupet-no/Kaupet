import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ClipboardCheck, Loader2, Pencil, X } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  adminApproveVehicleModelClass,
  adminRejectVehicleModelClass,
  adminUpdateVehicleBrand,
  adminUpdateVehicleModel,
  adminUpdateVehicleModelClass,
} from "@/lib/vehicle/admin-vehicle-brands.functions";
import { formatErrorMessage } from "@/lib/errors";
import { EmptyState } from "@/components/ui/empty-state";

type PendingRow = {
  kind: string;
  id: string;
  name: string;
  category_group: string;
  brand_name: string | null;
  /** Only set for `kind === "model"`; passed back unchanged on rename so
   * editing the name never silently clears an already-assigned class. */
  class_id: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  created_at: string;
};

/** Lets an admin fix the free-text name Statens vegvesen returned (casing,
 * spacing, typos) before approving it into the shared catalog — the same
 * `adminUpdate*` functions used for already-approved entries in
 * `admin/kjoretoy.tsx`, reused here instead of a parallel update path. Only
 * renames; reassigning a model's brand or class isn't exposed here since
 * that needs a full brand-scoped picker, not requested by this flow. */
function EditPendingEntryDialog({
  row,
  onClose,
  onSaved,
}: {
  row: PendingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.name);
  const updateBrandFn = useServerFn(adminUpdateVehicleBrand);
  const updateModelFn = useServerFn(adminUpdateVehicleModel);
  const updateClassFn = useServerFn(adminUpdateVehicleModelClass);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (row.kind === "brand") {
        await updateBrandFn({ data: { id: row.id, name: trimmed } });
      } else if (row.kind === "class") {
        await updateClassFn({ data: { id: row.id, name: trimmed } });
      } else {
        await updateModelFn({
          data: { id: row.id, name: trimmed, classId: row.class_id ?? undefined },
        });
      }
    },
    onSuccess: () => {
      showSuccessToast("Forslag oppdatert");
      onSaved();
      onClose();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere forslaget")),
  });

  const kindLabel =
    row.kind === "brand"
      ? "merkeforslaget"
      : row.kind === "class"
        ? "klasseforslaget"
        : "modellforslaget";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rediger {kindLabel}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              showErrorToast("Navn er påkrevd");
              return;
            }
            save.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="pending-entry-name">Navn</Label>
            <Input
              id="pending-entry-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VehicleBrandsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPendingVehicleEntries);
  const approveBrandFn = useServerFn(adminApproveVehicleBrand);
  const rejectBrandFn = useServerFn(adminRejectVehicleBrand);
  const approveModelFn = useServerFn(adminApproveVehicleModel);
  const rejectModelFn = useServerFn(adminRejectVehicleModel);
  const approveClassFn = useServerFn(adminApproveVehicleModelClass);
  const rejectClassFn = useServerFn(adminRejectVehicleModelClass);
  const [editingRow, setEditingRow] = useState<PendingRow | null>(null);

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
        : row.kind === "class"
          ? approveClassFn({ data: { id: row.id } })
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
        : row.kind === "class"
          ? rejectClassFn({ data: { id: row.id } })
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
        <EmptyState
          icon={ClipboardCheck}
          title="Ingen ventende forslag"
          description="Innsendte kjøretøymerker og -modeller venter her på godkjenning."
        />
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
                    <Badge variant="outline">
                      {r.kind === "brand" ? "Merke" : r.kind === "class" ? "Klasse" : "Modell"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.kind === "model" || r.kind === "class" ? r.brand_name : r.category_group}
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
                      onClick={() => setEditingRow(r)}
                      aria-label={`Rediger ${r.name}`}
                    >
                      <Pencil className="size-3.5" />
                      Rediger
                    </Button>
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

      {editingRow && (
        <EditPendingEntryDialog
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}
