import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { VehicleBrandsTab } from "@/components/admin/moderasjon/vehicle-brands-tab";
import { VEHICLE_BRAND_GROUP_LABELS_NB, type VehicleBrandGroup } from "@/lib/category-filters";
import {
  adminListVehicleBrandsWithModels,
  adminCreateVehicleBrand,
  adminUpdateVehicleBrand,
  adminDeleteVehicleBrand,
  adminCreateVehicleModel,
  adminUpdateVehicleModel,
  adminDeleteVehicleModel,
  adminCreateVehicleModelClass,
  adminUpdateVehicleModelClass,
  adminDeleteVehicleModelClass,
} from "@/lib/vehicle/admin-vehicle-brands.functions";

export const Route = createFileRoute("/_authenticated/admin/kjoretoy")({
  component: VehicleBrandsPage,
});

type Row = {
  brand_id: string;
  brand_name: string;
  category_group: VehicleBrandGroup;
  model_id: string | null;
  model_name: string | null;
  class_id: string | null;
  class_name: string | null;
};

type Brand = { id: string; name: string; category_group: VehicleBrandGroup };
type Model = { id: string; name: string; class_id: string | null };
type ModelClass = { id: string; name: string };

const GROUPS = Object.keys(VEHICLE_BRAND_GROUP_LABELS_NB) as VehicleBrandGroup[];

function VehicleBrandsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Merker og modeller</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrer merker og modeller for alle kjøretøygrupper — bil, motorsykkel, moped/ATV,
          bobil/campingvogn og tilhenger.
        </p>
      </div>
      <Tabs defaultValue="crud">
        <TabsList>
          <TabsTrigger value="crud">Merker og modeller</TabsTrigger>
          <TabsTrigger value="pending">Ventende forslag</TabsTrigger>
        </TabsList>
        <TabsContent value="crud" className="pt-4">
          <VehicleBrandsCrud />
        </TabsContent>
        <TabsContent value="pending" className="pt-4">
          <VehicleBrandsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VehicleBrandsCrud() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListVehicleBrandsWithModels);
  const [group, setGroup] = useState<VehicleBrandGroup>("bil");
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [brandDialog, setBrandDialog] = useState<{
    mode: "create" | "edit";
    brand: Brand | null;
  } | null>(null);
  const [modelDialog, setModelDialog] = useState<{
    mode: "create" | "edit";
    model: Model | null;
  } | null>(null);
  const [classDialog, setClassDialog] = useState<{
    mode: "create" | "edit";
    modelClass: ModelClass | null;
  } | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null);
  const [deletingModel, setDeletingModel] = useState<Model | null>(null);
  const [deletingClass, setDeletingClass] = useState<ModelClass | null>(null);
  const deleteBrandFn = useServerFn(adminDeleteVehicleBrand);
  const deleteModelFn = useServerFn(adminDeleteVehicleModel);
  const deleteClassFn = useServerFn(adminDeleteVehicleModelClass);

  const {
    data: rows,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ["admin-vehicle-brands-with-models"],
    queryFn: () => listFn() as Promise<Row[]>,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-vehicle-brands-with-models"] });

  const brandsInGroup = useMemo(() => {
    const byId = new Map<string, Brand>();
    for (const r of rows ?? []) {
      if (r.category_group === group)
        byId.set(r.brand_id, {
          id: r.brand_id,
          name: r.brand_name,
          category_group: r.category_group,
        });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
  }, [rows, group]);

  const selectedBrand = brandsInGroup.find((b) => b.id === selectedBrandId) ?? null;

  const models: Model[] = useMemo(() => {
    if (!selectedBrand) return [];
    return (rows ?? [])
      .filter((r) => r.brand_id === selectedBrand.id && r.model_id)
      .map((r) => ({
        id: r.model_id as string,
        name: r.model_name as string,
        class_id: r.class_id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
  }, [rows, selectedBrand]);

  // De aller fleste merker har ingen klasser i det hele tatt — kolonnen
  // grupperer da modellene rett under merket, uendret fra i dag.
  const classesForBrand: ModelClass[] = useMemo(() => {
    if (!selectedBrand) return [];
    const byId = new Map<string, ModelClass>();
    for (const r of rows ?? []) {
      if (r.brand_id === selectedBrand.id && r.class_id && r.class_name) {
        byId.set(r.class_id, { id: r.class_id, name: r.class_name });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
  }, [rows, selectedBrand]);

  const deleteBrand = ({ id, onDone }: { id: string; onDone: () => void }) => {
    deleteBrandFn({ data: { id } })
      .then(() => {
        showSuccessToast("Merke slettet");
        onDone();
      })
      .catch((e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette merket")));
  };

  const deleteModel = ({ id, onDone }: { id: string; onDone: () => void }) => {
    deleteModelFn({ data: { id } })
      .then(() => {
        showSuccessToast("Modell slettet");
        onDone();
      })
      .catch((e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette modellen")));
  };

  const deleteClass = ({ id, onDone }: { id: string; onDone: () => void }) => {
    deleteClassFn({ data: { id } })
      .then(() => {
        showSuccessToast("Klasse slettet");
        onDone();
      })
      .catch((e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette klassen")));
  };

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
        <p className="font-medium">Kunne ikke laste merker/modeller</p>
        <p className="mt-1 font-mono text-xs opacity-80">
          {queryError instanceof Error ? queryError.message : String(queryError)}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[10rem_16rem_1fr]">
      <Card>
        <CardContent className="space-y-1 p-2">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGroup(g);
                setSelectedBrandId(null);
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                g === group
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {VEHICLE_BRAND_GROUP_LABELS_NB[g]}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-medium">Merker</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => setBrandDialog({ mode: "create", brand: null })}
            >
              <Plus className="size-4" /> Nytt
            </Button>
          </div>
          {brandsInGroup.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Ingen merker i denne gruppen ennå.</p>
          ) : (
            <div className="space-y-0.5">
              {brandsInGroup.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                    b.id === selectedBrandId ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setSelectedBrandId(b.id)}
                  >
                    {b.name}
                  </button>
                  <div className="flex gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => setBrandDialog({ mode: "edit", brand: b })}
                      aria-label={`Rediger ${b.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => setDeletingBrand(b)}
                      aria-label={`Slett ${b.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-3">
          {!selectedBrand ? (
            <p className="p-3 text-sm text-muted-foreground">Velg et merke for å se modeller.</p>
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-medium">Modeller — {selectedBrand.name}</p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => setClassDialog({ mode: "create", modelClass: null })}
                  >
                    <Plus className="size-4" /> Klasse
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => setModelDialog({ mode: "create", model: null })}
                  >
                    <Plus className="size-4" /> Ny
                  </Button>
                </div>
              </div>
              {models.length === 0 && classesForBrand.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Ingen modeller registrert ennå.</p>
              ) : (
                <div className="space-y-3">
                  {models.some((m) => !m.class_id) && (
                    <ModelGroup
                      title={classesForBrand.length > 0 ? "Uten klasse" : null}
                      models={models.filter((m) => !m.class_id)}
                      onEdit={(m) => setModelDialog({ mode: "edit", model: m })}
                      onDelete={setDeletingModel}
                    />
                  )}
                  {classesForBrand.map((c) => (
                    <div key={c.id} className="space-y-0.5">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-xs font-medium text-muted-foreground">{c.name}</p>
                        <div className="flex gap-0.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            onClick={() => setClassDialog({ mode: "edit", modelClass: c })}
                            aria-label={`Rediger ${c.name}`}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6 text-destructive hover:text-destructive"
                            onClick={() => setDeletingClass(c)}
                            aria-label={`Slett ${c.name}`}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                      <ModelGroup
                        title={null}
                        models={models.filter((m) => m.class_id === c.id)}
                        onEdit={(m) => setModelDialog({ mode: "edit", model: m })}
                        onDelete={setDeletingModel}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {brandDialog && (
        <BrandFormDialog
          mode={brandDialog.mode}
          brand={brandDialog.brand}
          defaultGroup={group}
          onClose={() => setBrandDialog(null)}
          onSaved={invalidate}
        />
      )}
      {modelDialog && selectedBrand && (
        <ModelFormDialog
          mode={modelDialog.mode}
          model={modelDialog.model}
          brandId={selectedBrand.id}
          classes={classesForBrand}
          onClose={() => setModelDialog(null)}
          onSaved={invalidate}
        />
      )}
      {classDialog && selectedBrand && (
        <ModelClassFormDialog
          mode={classDialog.mode}
          modelClass={classDialog.modelClass}
          brandId={selectedBrand.id}
          onClose={() => setClassDialog(null)}
          onSaved={invalidate}
        />
      )}

      <AlertDialog open={!!deletingBrand} onOpenChange={(o) => !o && setDeletingBrand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette «{deletingBrand?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Merket og alle modellene under det fjernes fra nedtrekkslistene. Allerede publiserte
              annonser som bruker merket beholder verdien uendret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deletingBrand) return;
                deleteBrand({
                  id: deletingBrand.id,
                  onDone: () => {
                    if (selectedBrandId === deletingBrand.id) setSelectedBrandId(null);
                    setDeletingBrand(null);
                    invalidate();
                  },
                });
              }}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingModel} onOpenChange={(o) => !o && setDeletingModel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette «{deletingModel?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Modellen fjernes fra nedtrekkslisten. Allerede publiserte annonser som bruker modellen
              beholder verdien uendret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deletingModel) return;
                deleteModel({
                  id: deletingModel.id,
                  onDone: () => {
                    setDeletingModel(null);
                    invalidate();
                  },
                });
              }}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingClass} onOpenChange={(o) => !o && setDeletingClass(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette «{deletingClass?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Klassen fjernes. Modeller under den blir liggende klasseløse, ikke slettet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deletingClass) return;
                deleteClass({
                  id: deletingClass.id,
                  onDone: () => {
                    setDeletingClass(null);
                    invalidate();
                  },
                });
              }}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ModelGroup({
  title,
  models,
  onEdit,
  onDelete,
}: {
  title: string | null;
  models: Model[];
  onEdit: (m: Model) => void;
  onDelete: (m: Model) => void;
}) {
  if (models.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {title && <p className="px-1 text-xs font-medium text-muted-foreground">{title}</p>}
      {models.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted/60"
        >
          <span>{m.name}</span>
          <div className="flex gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => onEdit(m)}
              aria-label={`Rediger ${m.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(m)}
              aria-label={`Slett ${m.name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BrandFormDialog({
  mode,
  brand,
  defaultGroup,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  brand: Brand | null;
  defaultGroup: VehicleBrandGroup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(brand?.name ?? "");
  const [group, setGroup] = useState<VehicleBrandGroup>(brand?.category_group ?? defaultGroup);
  const createFn = useServerFn(adminCreateVehicleBrand);
  const updateFn = useServerFn(adminUpdateVehicleBrand);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        await createFn({ data: { name: name.trim(), categoryGroup: group } });
      } else if (brand) {
        await updateFn({ data: { id: brand.id, name: name.trim() } });
      }
    },
    onSuccess: () => {
      showSuccessToast(mode === "create" ? "Merke opprettet" : "Merke oppdatert");
      onSaved();
      onClose();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre merket")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nytt merke" : "Rediger merke"}</DialogTitle>
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
            <Label htmlFor="brand-name">Navn</Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Kjøretøygruppe</Label>
            <Select
              value={group}
              onValueChange={(v) => setGroup(v as VehicleBrandGroup)}
              disabled={mode === "edit"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VEHICLE_BRAND_GROUP_LABELS_NB) as VehicleBrandGroup[]).map((g) => (
                  <SelectItem key={g} value={g}>
                    {VEHICLE_BRAND_GROUP_LABELS_NB[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mode === "edit" && (
              <p className="text-xs text-muted-foreground">
                Gruppe kan ikke endres — slett og opprett på nytt om merket hører til feil gruppe.
              </p>
            )}
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

function ModelFormDialog({
  mode,
  model,
  brandId,
  classes,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  model: Model | null;
  brandId: string;
  /** Merkets klasser, om noen — de aller fleste merker har ingen, og feltet
   * skjules da helt. */
  classes: ModelClass[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(model?.name ?? "");
  const [classId, setClassId] = useState<string | null>(model?.class_id ?? null);
  const createFn = useServerFn(adminCreateVehicleModel);
  const updateFn = useServerFn(adminUpdateVehicleModel);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        await createFn({ data: { brandId, name: name.trim(), classId: classId ?? undefined } });
      } else if (model) {
        await updateFn({
          data: { id: model.id, name: name.trim(), classId: classId ?? undefined },
        });
      }
    },
    onSuccess: () => {
      showSuccessToast(mode === "create" ? "Modell opprettet" : "Modell oppdatert");
      onSaved();
      onClose();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre modellen")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Ny modell" : "Rediger modell"}</DialogTitle>
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
            <Label htmlFor="model-name">Navn</Label>
            <Input
              id="model-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          {classes.length > 0 && (
            <div className="space-y-2">
              <Label>Klasse</Label>
              <Select
                value={classId ?? "__none__"}
                onValueChange={(v) => setClassId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen klasse</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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

function ModelClassFormDialog({
  mode,
  modelClass,
  brandId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  modelClass: ModelClass | null;
  brandId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(modelClass?.name ?? "");
  const createFn = useServerFn(adminCreateVehicleModelClass);
  const updateFn = useServerFn(adminUpdateVehicleModelClass);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        await createFn({ data: { brandId, name: name.trim() } });
      } else if (modelClass) {
        await updateFn({ data: { id: modelClass.id, name: name.trim() } });
      }
    },
    onSuccess: () => {
      showSuccessToast(mode === "create" ? "Klasse opprettet" : "Klasse oppdatert");
      onSaved();
      onClose();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre klassen")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Ny klasse" : "Rediger klasse"}</DialogTitle>
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
            <Label htmlFor="class-name">Navn</Label>
            <Input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              placeholder="F.eks. C-klasse"
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
