import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronsUpDown,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatErrorMessage } from "@/lib/errors";
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from "@/lib/category-icons";

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
  icon: string | null;
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
  const [replacementId, setReplacementId] = useState<string>("__none__");
  const [search, setSearch] = useState("");

  const { data: categories, isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, slug, parent_id, sort_order, icon")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: popularCategories } = useQuery({
    queryKey: ["admin", "category-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_popular_categories");
      if (error) throw error;
      return data ?? [];
    },
  });

  const countsById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of popularCategories ?? []) map.set(c.id, c.listing_count);
    return map;
  }, [popularCategories]);

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

  const filteredTree = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tree;
    const all = categories ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const matchedIds = all.filter(
      (c) => c.name_nb.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term),
    );
    const visible = new Set<string>();
    for (const match of matchedIds) {
      let cur: Category | undefined = match;
      while (cur) {
        visible.add(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
    }
    const addDescendants = (id: string) => {
      for (const child of tree.get(id) ?? []) {
        visible.add(child.id);
        addDescendants(child.id);
      }
    };
    for (const match of matchedIds) addDescendants(match.id);
    const filtered = new Map<string | null, Category[]>();
    for (const [parentId, kids] of tree.entries()) {
      filtered.set(
        parentId,
        kids.filter((k) => visible.has(k.id)),
      );
    }
    return filtered;
  }, [tree, categories, search]);

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
    mutationFn: async ({ id, replaceWith }: { id: string; replaceWith: string | null }) => {
      if (replaceWith) {
        const { error: moveError } = await supabase
          .from("listings")
          .update({ category_id: replaceWith })
          .eq("category_id", id);
        if (moveError) throw moveError;
      }
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Kategori slettet");
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      qc.invalidateQueries({ queryKey: ["admin", "category-counts"] });
      setDeleting(null);
      setReplacementId("__none__");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette kategorien")),
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("categories").update({ sort_order: u.sort_order }).eq("id", u.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre rekkefølgen")),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const all = categories ?? [];
    const activeCat = all.find((c) => c.id === active.id);
    const overCat = all.find((c) => c.id === over.id);
    if (!activeCat || !overCat || activeCat.parent_id !== overCat.parent_id) return;
    const siblings = tree.get(activeCat.parent_id) ?? [];
    const oldIndex = siblings.findIndex((c) => c.id === active.id);
    const newIndex = siblings.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(siblings, oldIndex, newIndex);
    reorderMutation.mutate(
      reordered.map((c: Category, i: number) => ({ id: c.id, sort_order: (i + 1) * 10 })),
    );
  }

  const roots = filteredTree.get(null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Administrer kategorier og underkategorier. Endringer påvirker alle annonser.
        </p>
        <Button onClick={() => setCreating({ parentId: null })}>
          <Plus className="size-4" /> Ny kategori
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Søk etter kategori…"
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-2 sm:p-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : roots.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {search.trim() ? "Ingen kategorier matcher søket" : "Ingen kategorier ennå"}
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <CategoryList
                categories={roots}
                childrenMap={filteredTree}
                countsById={countsById}
                depth={0}
                onEdit={setEditing}
                onDelete={setDeleting}
                onAddChild={(parent) => setCreating({ parentId: parent.id })}
              />
            </DndContext>
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

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) {
            setDeleting(null);
            setReplacementId("__none__");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette «{deleting?.name_nb}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {usageQuery.isLoading ? (
                "Sjekker bruk…"
              ) : usageQuery.data && usageQuery.data > 0 ? (
                <>
                  <strong>{usageQuery.data}</strong> annonser er knyttet til denne kategorien. Velg
                  en erstatningskategori under, eller la annonsene miste kategorien sin.
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
          {!usageQuery.isLoading && (usageQuery.data ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>Erstatningskategori</Label>
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen (fjern kategori fra annonsene)</SelectItem>
                  {(categories ?? [])
                    .filter((c) => c.id !== deleting?.id && c.parent_id !== deleting?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.parent_id ? `↳ ${c.name_nb}` : c.name_nb}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                deleteMutation.isPending || (tree.get(deleting?.id ?? null)?.length ?? 0) > 0
              }
              onClick={() =>
                deleting &&
                deleteMutation.mutate({
                  id: deleting.id,
                  replaceWith: replacementId === "__none__" ? null : replacementId,
                })
              }
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Slett"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryList({
  categories,
  childrenMap,
  countsById,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  categories: Category[];
  childrenMap: Map<string | null, Category[]>;
  countsById: Map<string, number>;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onAddChild: (c: Category) => void;
}) {
  return (
    <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
      <ul className="space-y-1">
        {categories.map((c) => (
          <SortableCategoryRow
            key={c.id}
            category={c}
            childrenMap={childrenMap}
            countsById={countsById}
            depth={depth}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ))}
      </ul>
    </SortableContext>
  );
}

function SortableCategoryRow({
  category,
  childrenMap,
  countsById,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  category: Category;
  childrenMap: Map<string | null, Category[]>;
  countsById: Map<string, number>;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onAddChild: (c: Category) => void;
}) {
  const kids = childrenMap.get(category.id) ?? [];
  const Icon = getCategoryIcon(category.icon);
  const listingCount = countsById.get(category.id) ?? 0;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-accent/40"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="Dra for å endre rekkefølge"
          >
            <GripVertical className="size-4" />
          </button>
          {depth > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{category.name_nb}</span>
          <span className="truncate text-xs text-muted-foreground">/{category.slug}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {listingCount} annonser
          </span>
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
        <CategoryList
          categories={kids}
          childrenMap={childrenMap}
          countsById={countsById}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
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
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name_nb: name.trim(),
        slug: slug.trim() || slugify(name),
        sort_order: sortOrder,
        parent_id: parent === "__none__" ? null : parent,
        icon,
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
      showSuccessToast(category ? "Kategori oppdatert" : "Kategori opprettet");
      onSaved();
      onClose();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre kategorien")),
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
              showErrorToast("Navn er påkrevd");
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
          <div className="space-y-2">
            <Label>Ikon</Label>
            <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={iconPickerOpen}
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    {(() => {
                      const SelectedIcon = getCategoryIcon(icon);
                      return <SelectedIcon className="size-4" />;
                    })()}
                    {icon ?? "Velg ikon"}
                  </span>
                  <ChevronsUpDown className="size-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                <Command>
                  <CommandInput placeholder="Søk etter ikon…" />
                  <CommandList>
                    <CommandEmpty>Ingen ikoner funnet</CommandEmpty>
                    <CommandGroup>
                      {CATEGORY_ICON_OPTIONS.map(({ name: iconName, icon: IconComponent }) => (
                        <CommandItem
                          key={iconName}
                          value={iconName}
                          onSelect={() => {
                            setIcon(iconName);
                            setIconPickerOpen(false);
                          }}
                        >
                          <IconComponent className="size-4" />
                          {iconName}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
