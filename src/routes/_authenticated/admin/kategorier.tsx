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
  SlidersHorizontal,
  Trash2,
  X,
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
import {
  FILTER_TYPE_LABELS,
  normalizeFilter,
  type CategoryFilter,
  type FilterOption,
  type FilterType,
} from "@/lib/category-filters";

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
  color: string | null;
};

// Suggested unique colors for main categories (OKLch, matching the design system).
const MAIN_CATEGORY_COLOR_PRESETS = [
  "oklch(0.62 0.13 250)",
  "oklch(0.66 0.12 50)",
  "oklch(0.60 0.12 150)",
  "oklch(0.65 0.13 350)",
  "oklch(0.68 0.14 70)",
  "oklch(0.62 0.10 90)",
  "oklch(0.55 0.06 260)",
  "oklch(0.58 0.13 310)",
  "oklch(0.70 0.10 200)",
  "oklch(0.55 0.12 240)",
];

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
  const [managingFilters, setManagingFilters] = useState<Category | null>(null);
  const [search, setSearch] = useState("");

  const { data: categories, isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, slug, parent_id, sort_order, icon, color")
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
                onManageFilters={setManagingFilters}
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

      {managingFilters && (
        <CategoryFiltersDialog
          category={managingFilters}
          onClose={() => setManagingFilters(null)}
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
  onManageFilters,
}: {
  categories: Category[];
  childrenMap: Map<string | null, Category[]>;
  countsById: Map<string, number>;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onAddChild: (c: Category) => void;
  onManageFilters: (c: Category) => void;
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
            onManageFilters={onManageFilters}
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
  onManageFilters,
}: {
  category: Category;
  childrenMap: Map<string | null, Category[]>;
  countsById: Map<string, number>;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onAddChild: (c: Category) => void;
  onManageFilters: (c: Category) => void;
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
          {depth === 0 && category.color && (
            <span
              className="size-4 shrink-0 rounded-full border"
              style={{ background: category.color }}
              aria-hidden
            />
          )}
          {depth === 0 && (
            <Button variant="ghost" size="sm" onClick={() => onAddChild(category)}>
              <Plus className="size-4" /> Underkategori
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onManageFilters(category)}
            aria-label="Filtre"
            title="Administrer filtre"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
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
          onManageFilters={onManageFilters}
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
  const [color, setColor] = useState<string>(category?.color ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name_nb: name.trim(),
        slug: slug.trim() || slugify(name),
        sort_order: sortOrder,
        parent_id: parent === "__none__" ? null : parent,
        icon,
        // Color only applies to main (top-level) categories.
        color: parent === "__none__" ? color.trim() || null : null,
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
          {parent === "__none__" && (
            <div className="space-y-2">
              <Label htmlFor="color">Farge (hovedkategori)</Label>
              <div className="flex items-center gap-2">
                <span
                  className="size-9 shrink-0 rounded-md border"
                  style={{ background: color || "transparent" }}
                  aria-hidden
                />
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="oklch(0.62 0.13 250)"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MAIN_CATEGORY_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    className="size-6 rounded-full border ring-offset-background transition hover:ring-2 hover:ring-ring"
                    style={{ background: preset }}
                    aria-label={`Velg farge ${preset}`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Brukes som bakgrunn på landingssiden og som aksent på kategorisiden. La stå tom for
                å skjule kategorien som hovedkategori.
              </p>
            </div>
          )}
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

function filterKeyify(s: string) {
  return slugify(s).replace(/-/g, "_");
}

const FILTER_TYPES: FilterType[] = ["select", "multiselect", "number", "range", "boolean", "text"];

type EditableFilter = {
  id?: string;
  key: string;
  label_nb: string;
  type: FilterType;
  unit: string;
  options: FilterOption[];
};

function CategoryFiltersDialog({ category, onClose }: { category: Category; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EditableFilter | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);

  const { data: filters, isLoading } = useQuery({
    queryKey: ["admin", "category-filters", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order")
        .eq("category_id", category.id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin", "category-filters", category.id] });

  const save = useMutation({
    mutationFn: async (f: EditableFilter) => {
      const usesOptions = f.type === "select" || f.type === "multiselect";
      const payload = {
        category_id: category.id,
        key: f.key.trim() || filterKeyify(f.label_nb),
        label_nb: f.label_nb.trim(),
        type: f.type,
        unit: f.unit.trim() || null,
        options: usesOptions ? f.options.filter((o) => o.value.trim()) : null,
        sort_order: (filters?.length ?? 0) * 10 + 10,
      };
      if (f.id) {
        const { error } = await supabase.from("category_filters").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("category_filters").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      showSuccessToast("Filter lagret");
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre filteret")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("category_filters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Filter slettet");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette filteret")),
  });

  function startNew() {
    setKeyTouched(false);
    setDraft({
      key: "",
      label_nb: "",
      type: "select",
      unit: "",
      options: [{ value: "", label_nb: "" }],
    });
  }

  function startEdit(f: CategoryFilter) {
    setKeyTouched(true);
    setDraft({
      id: f.id,
      key: f.key,
      label_nb: f.label_nb,
      type: f.type,
      unit: f.unit ?? "",
      options: f.options && f.options.length > 0 ? f.options : [{ value: "", label_nb: "" }],
    });
  }

  const usesOptions = draft?.type === "select" || draft?.type === "multiselect";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filtre for «{category.name_nb}»</DialogTitle>
          <DialogDescription>
            Filtre vises i annonseskjema og søk for denne kategorien og dens underkategorier.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-1">
            {(filters ?? []).length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">Ingen filtre ennå.</li>
            )}
            {(filters ?? []).map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
              >
                <div className="min-w-0">
                  <span className="font-medium">{f.label_nb}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {FILTER_TYPE_LABELS[f.type]}
                    {f.unit ? ` · ${f.unit}` : ""} · {f.key}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(f)}
                    aria-label="Rediger"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove.mutate(f.id)}
                    aria-label="Slett"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {draft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.label_nb.trim()) {
                showErrorToast("Navn er påkrevd");
                return;
              }
              save.mutate(draft);
            }}
            className="space-y-4 rounded-md border p-3"
          >
            <div className="space-y-2">
              <Label htmlFor="f-label">Navn</Label>
              <Input
                id="f-label"
                value={draft.label_nb}
                onChange={(e) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          label_nb: e.target.value,
                          key: keyTouched ? d.key : filterKeyify(e.target.value),
                        }
                      : d,
                  )
                }
                placeholder="f.eks. Skjermstørrelse"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="f-key">Nøkkel</Label>
                <Input
                  id="f-key"
                  value={draft.key}
                  onChange={(e) => {
                    setKeyTouched(true);
                    setDraft((d) => (d ? { ...d, key: e.target.value } : d));
                  }}
                  placeholder="tv_size_inch"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) => setDraft((d) => (d ? { ...d, type: v as FilterType } : d))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {FILTER_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-unit">Enhet (valgfritt)</Label>
              <Input
                id="f-unit"
                value={draft.unit}
                onChange={(e) => setDraft((d) => (d ? { ...d, unit: e.target.value } : d))}
                placeholder="f.eks. tommer, km"
              />
            </div>
            {usesOptions && (
              <div className="space-y-2">
                <Label>Valg</Label>
                {draft.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt.label_nb}
                      onChange={(e) =>
                        setDraft((d) => {
                          if (!d) return d;
                          const options = [...d.options];
                          options[i] = {
                            label_nb: e.target.value,
                            value: options[i].value.trim() || filterKeyify(e.target.value),
                          };
                          return { ...d, options };
                        })
                      }
                      placeholder="Visningsnavn (f.eks. OLED)"
                    />
                    <Input
                      value={opt.value}
                      onChange={(e) =>
                        setDraft((d) => {
                          if (!d) return d;
                          const options = [...d.options];
                          options[i] = { ...options[i], value: e.target.value };
                          return { ...d, options };
                        })
                      }
                      placeholder="verdi (oled)"
                      className="max-w-[8rem]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDraft((d) =>
                          d ? { ...d, options: d.options.filter((_, j) => j !== i) } : d,
                        )
                      }
                      aria-label="Fjern valg"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft((d) =>
                      d ? { ...d, options: [...d.options, { value: "", label_nb: "" }] } : d,
                    )
                  }
                >
                  <Plus className="size-4" /> Legg til valg
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre filter"}
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={startNew}>
            <Plus className="size-4" /> Nytt filter
          </Button>
        )}

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Lukk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
