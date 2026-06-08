import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/kategorier")({
  head: () => ({ meta: [{ title: "Kategoriadministrasjon — Kaupet.no" }] }),
  component: AdminCategories,
});

type Category = {
  id: string;
  name_nb: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[æå]/g, "a")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function AdminCategories() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, slug, parent_id, sort_order")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const tree = useMemo(() => {
    const all = categories ?? [];
    const byParent = new Map<string | null, Category[]>();
    for (const c of all) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
    return byParent;
  }, [categories]);

  const usageQuery = useQuery({
    queryKey: ["admin", "category-usage", deleting?.id],
    enabled: !!deleting,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("category_id", deleting!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kategori slettet");
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke slette kategorien")),
  });

  const roots = tree.get(null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Administrer kategorier og underkategorier. Endringer påvirker alle annonser.
        </p>
        <Button onClick={() => setCreating({ parentId: null })}>
          <Plus className="size-4" /> Ny kategori
        </Button>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : roots.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Ingen kategorier ennå</p>
          ) : (
            <ul className="space-y-1">
              {roots.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  childrenMap={tree}
                  depth={0}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  onAddChild={(parent) => setCreating({ parentId: parent.id })}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <CategoryFormDialog
          category={editing}
          parentId={creating?.parentId ?? null}
          categories={categories ?? []}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "categories"] })}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette «{deleting?.name_nb}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {usageQuery.isLoading ? (
                "Sjekker bruk…"
              ) : usageQuery.data && usageQuery.data > 0 ? (
                <>
                  <strong>{usageQuery.data}</strong> annonser er knyttet til denne kategorien.
                  Annonsene mister kategorien sin (verdien blir satt til ingen kategori).
                </>
              ) : (
                "Kategorien er ikke i bruk og kan trygt slettes."
              )}
              {(tree.get(deleting?.id ?? null)?.length ?? 0) > 0 && (
                <p className="mt-2 text-destructive">
                  Kategorien har underkategorier. Slett eller flytt dem først.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                deleteMutation.isPending || (tree.get(deleting?.id ?? null)?.length ?? 0) > 0
              }
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Slett"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryRow({
  category,
  childrenMap,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  category: Category;
  childrenMap: Map<string | null, Category[]>;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onAddChild: (c: Category) => void;
}) {
  const kids = childrenMap.get(category.id) ?? [];
  return (
    <li>
      <div
        className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-accent/40"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {depth > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
          <span className="truncate font-medium">{category.name_nb}</span>
          <span className="truncate text-xs text-muted-foreground">/{category.slug}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {depth === 0 && (
            <Button variant="ghost" size="sm" onClick={() => onAddChild(category)}>
              <Plus className="size-4" /> Underkategori
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onEdit(category)} aria-label="Rediger">
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(category)}
            aria-label="Slett"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {kids.length > 0 && (
        <ul className="space-y-1">
          {kids.map((k) => (
            <CategoryRow
              key={k.id}
              category={k}
              childrenMap={childrenMap}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CategoryFormDialog({
  category,
  parentId,
  categories,
  onClose,
  onSaved,
}: {
  category: Category | null;
  parentId: string | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name_nb ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [sortOrder, setSortOrder] = useState(category?.sort_order ?? 0);
  const [parent, setParent] = useState<string>(category?.parent_id ?? parentId ?? "__none__");
  const [slugTouched, setSlugTouched] = useState(!!category);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name_nb: name.trim(),
        slug: slug.trim() || slugify(name),
        sort_order: sortOrder,
        parent_id: parent === "__none__" ? null : parent,
      };
      if (category) {
        const { error } = await supabase.from("categories").update(payload).eq("id", category.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(category ? "Kategori oppdatert" : "Kategori opprettet");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke lagre kategorien")),
  });

  const possibleParents = categories.filter(
    (c) => !category || (c.id !== category.id && c.parent_id !== category.id),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Rediger kategori" : "Ny kategori"}</DialogTitle>
          <DialogDescription>
            {parentId && !category ? "Opprettes som underkategori." : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Navn er påkrevd");
              return;
            }
            save.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Navn</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              maxLength={80}
              placeholder="auto-generert fra navn"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sort">Sorteringsrekkefølge</Label>
              <Input
                id="sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Overordnet kategori</Label>
              <Select value={parent} onValueChange={setParent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen (toppnivå)</SelectItem>
                  {possibleParents
                    .filter((c) => c.parent_id === null)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_nb}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
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
