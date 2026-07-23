import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FolderTree,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Workflow,
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
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  collectDescendantIds,
  depthOf,
  flattenTree,
  getProjection,
  MAX_CATEGORY_DEPTH,
} from "@/lib/category-admin-tree";

import { supabase } from "@/integrations/supabase/client";
import { CategoryPicker } from "@/components/category-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_ICON_OPTIONS, getCategoryIcon } from "@/lib/category-icons";
import {
  FILTER_TYPE_LABELS,
  normalizeFilter,
  type CategoryFilter,
  type FilterOption,
  type FilterType,
} from "@/lib/category-filters";
import { CATEGORY_HEADING_FONTS, DEFAULT_CATEGORY_HEADING_FONT } from "@/lib/category-fonts";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_FIELD_GROUPS,
  DEFAULT_MODULES,
  resolveWizardPages,
} from "@/features/listing-creation/category-flows";
import { MODULE_LABELS_NB, MODULE_REGISTRY } from "@/features/listing-creation/modules/registry";
import {
  FIELD_GROUP_LABELS_NB,
  LOCKED_FIELD_GROUP_KEYS,
} from "@/features/listing-creation/field-groups/registry";

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
  heading_font: string | null;
  search_examples: string[] | null;
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

const INDENT_WIDTH = 24;

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

function DefaultSearchExamplesCard() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "site-settings", "default-search-examples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("default_search_examples")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data.default_search_examples;
    },
  });

  const value = draft ?? (data ?? []).join("\n");

  const save = useMutation({
    mutationFn: async () => {
      const words = value
        .split("\n")
        .map((w) => w.trim())
        .filter(Boolean);
      const { error } = await supabase
        .from("site_settings")
        .update({ default_search_examples: words })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Standard søkeord lagret");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "site-settings", "default-search-examples"] });
      qc.invalidateQueries({ queryKey: ["site-settings", "default-search-examples"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre søkeordene")),
  });

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Label htmlFor="default-search-examples">Standard søkeord (forsiden)</Label>
        <p className="text-xs text-muted-foreground">
          Ett ord/uttrykk per linje. Rulleres i søkefeltets typewriter-animasjon på forsiden før en
          kategori er valgt.
        </p>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <p className="text-sm text-destructive">
            {formatErrorMessage(error, "Kunne ikke laste søkeordene")}
          </p>
        ) : (
          <>
            <Textarea
              id="default-search-examples"
              value={value}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={draft === null || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AdminCategories() {
  const qc = useQueryClient();
  const [dialogState, setDialogState] = useState<{
    category: Category | null;
    parentId: string | null;
    initialTab: "details" | "filters" | "flow";
  } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [replacementId, setReplacementId] = useState<string>("__none__");
  const [search, setSearch] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [dragOffsetX, setDragOffsetX] = useState(0);

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const {
    data: categories,
    isLoading,
    isError,
    error: categoriesError,
  } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select(
          "id, name_nb, slug, parent_id, sort_order, icon, color, heading_font, search_examples",
        )
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

  // When searching, ignore collapse state and only show matched categories
  // plus their ancestors/descendants (same behavior as before flattening).
  const searchVisibleIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
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
    return visible;
  }, [tree, categories, search]);

  const hasChildrenSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of categories ?? []) if (c.parent_id) s.add(c.parent_id);
    return s;
  }, [categories]);

  const flatItems = useMemo(
    () => flattenTree(categories ?? [], searchVisibleIds ? new Set<string>() : collapsedIds),
    [categories, collapsedIds, searchVisibleIds],
  );

  const visibleFlatItems = useMemo(
    () => (searchVisibleIds ? flatItems.filter((i) => searchVisibleIds.has(i.id)) : flatItems),
    [flatItems, searchVisibleIds],
  );

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
    mutationFn: async (updates: { id: string; sort_order: number; parent_id: string | null }[]) => {
      const results = await Promise.all(
        updates.map((u) =>
          supabase
            .from("categories")
            .update({ sort_order: u.sort_order, parent_id: u.parent_id })
            .eq("id", u.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre rekkefølgen")),
  });

  const moveChildrenUpMutation = useMutation({
    mutationFn: async ({
      children,
      newParentId,
    }: {
      children: Category[];
      newParentId: string | null;
    }) => {
      const siblingMaxSortOrder = Math.max(
        0,
        ...(categories ?? [])
          .filter((c) => (c.parent_id ?? null) === newParentId)
          .map((c) => c.sort_order),
      );
      const updates = children.map((c, i) => ({
        id: c.id,
        sort_order: siblingMaxSortOrder + (i + 1) * 10,
        parent_id: newParentId,
      }));
      const results = await Promise.all(
        updates.map((u) =>
          supabase
            .from("categories")
            .update({ sort_order: u.sort_order, parent_id: u.parent_id })
            .eq("id", u.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      showSuccessToast("Underkategorier flyttet");
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
    onError: (e: Error) =>
      showErrorToast(formatErrorMessage(e, "Kunne ikke flytte underkategoriene")),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragMove(event: DragMoveEvent) {
    setDragOffsetX(event.delta.x);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragOffsetX(0);
    if (!over) return;
    const all = categories ?? [];
    const oldIndex = visibleFlatItems.findIndex((i) => i.id === active.id);
    const newIndex = visibleFlatItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedFlat = arrayMove(visibleFlatItems, oldIndex, newIndex);
    const projected = getProjection(
      reorderedFlat,
      String(active.id),
      dragOffsetX,
      INDENT_WIDTH,
      all,
    );
    if (!projected) return;
    const { parentId: newParentId } = projected;

    const updates: { id: string; sort_order: number; parent_id: string | null }[] = [];
    const groupCounters = new Map<string | null, number>();
    for (const item of reorderedFlat) {
      const effectiveParentId = item.id === active.id ? newParentId : item.parent_id;
      const n = (groupCounters.get(effectiveParentId) ?? 0) + 1;
      groupCounters.set(effectiveParentId, n);
      const newSortOrder = n * 10;
      if (item.id === active.id || item.sort_order !== newSortOrder) {
        updates.push({ id: item.id, sort_order: newSortOrder, parent_id: effectiveParentId });
      }
    }
    if (updates.length === 0) return;
    reorderMutation.mutate(updates);
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl tracking-tight">Kategorier</h2>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Administrer kategorier og underkategorier. Endringer påvirker alle annonser.
        </p>
        <Button
          onClick={() => setDialogState({ category: null, parentId: null, initialTab: "details" })}
        >
          <Plus className="size-4" /> Ny kategori
        </Button>
      </div>

      <DefaultSearchExamplesCard />

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Søk etter kategori…"
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-2 sm:p-4">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {formatErrorMessage(categoriesError, "Kunne ikke laste kategorier")}
            </p>
          ) : visibleFlatItems.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title={search.trim() ? "Ingen kategorier matcher søket" : "Ingen kategorier ennå"}
              description={search.trim() ? "Prøv et annet søk." : undefined}
              className="border-none"
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleFlatItems.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-1">
                  {visibleFlatItems.map((c) => (
                    <SortableCategoryRow
                      key={c.id}
                      category={c}
                      depth={c.depth}
                      hasChildren={hasChildrenSet.has(c.id)}
                      collapsed={collapsedIds.has(c.id)}
                      onToggleCollapse={toggleCollapsed}
                      countsById={countsById}
                      onEdit={(cat) =>
                        setDialogState({ category: cat, parentId: null, initialTab: "details" })
                      }
                      onDelete={setDeleting}
                      onAddChild={(parent) =>
                        setDialogState({
                          category: null,
                          parentId: parent.id,
                          initialTab: "details",
                        })
                      }
                      onManageFilters={(cat) =>
                        setDialogState({ category: cat, parentId: null, initialTab: "filters" })
                      }
                      onManageFlow={(cat) =>
                        setDialogState({ category: cat, parentId: null, initialTab: "flow" })
                      }
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {dialogState && (
        <CategoryDialog
          category={dialogState.category}
          parentId={dialogState.parentId}
          initialTab={dialogState.initialTab}
          categories={categories ?? []}
          onClose={() => setDialogState(null)}
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
              ) : usageQuery.isError ? (
                <span className="text-destructive">
                  {formatErrorMessage(usageQuery.error, "Kunne ikke sjekke bruk av kategorien")}
                </span>
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
          {(tree.get(deleting?.id ?? null)?.length ?? 0) > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={moveChildrenUpMutation.isPending}
              onClick={() => {
                if (!deleting) return;
                const children = tree.get(deleting.id) ?? [];
                moveChildrenUpMutation.mutate({ children, newParentId: deleting.parent_id });
              }}
            >
              {moveChildrenUpMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Workflow className="size-4" /> Flytt underkategorier til{" "}
                  {deleting?.parent_id
                    ? `«${categories?.find((c) => c.id === deleting.parent_id)?.name_nb ?? "overordnet"}»`
                    : "toppnivå"}
                </>
              )}
            </Button>
          )}
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

function SortableCategoryRow({
  category,
  depth,
  hasChildren,
  collapsed,
  onToggleCollapse,
  countsById,
  onEdit,
  onDelete,
  onAddChild,
  onManageFilters,
  onManageFlow,
}: {
  category: Category;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  countsById: Map<string, number>;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onAddChild: (c: Category) => void;
  onManageFilters: (c: Category) => void;
  onManageFlow: (c: Category) => void;
}) {
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
        style={{ paddingLeft: `${depth * INDENT_WIDTH + 8}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="Dra for å endre rekkefølge og nivå"
          >
            <GripVertical className="size-4" />
          </button>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapse(category.id)}
              className="text-muted-foreground"
              aria-label={collapsed ? "Vis underkategorier" : "Skjul underkategorier"}
            >
              {collapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-block size-3.5" aria-hidden />
          )}
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
          {depth < MAX_CATEGORY_DEPTH - 1 && (
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onManageFlow(category)}
            aria-label="Annonseflyt"
            title="Administrer annonseflyt"
          >
            <Workflow className="size-4" />
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
    </li>
  );
}

function CategoryDialog({
  category,
  parentId,
  initialTab,
  categories,
  onClose,
  onSaved,
}: {
  category: Category | null;
  parentId: string | null;
  initialTab: "details" | "filters" | "flow";
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [savedCategory, setSavedCategory] = useState<Category | null>(category);
  const [activeTab, setActiveTab] = useState<"details" | "filters" | "flow">(initialTab);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{savedCategory ? savedCategory.name_nb : "Ny kategori"}</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Detaljer</TabsTrigger>
            <TabsTrigger value="filters" disabled={!savedCategory}>
              Filtre
            </TabsTrigger>
            <TabsTrigger value="flow" disabled={!savedCategory}>
              Annonseflyt
            </TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <CategoryDetailsPanel
              category={savedCategory}
              parentId={parentId}
              categories={categories}
              onClose={onClose}
              onSaved={(saved) => {
                const isNewCategory = !savedCategory;
                setSavedCategory(saved);
                onSaved();
                if (isNewCategory) setActiveTab("filters");
              }}
            />
          </TabsContent>
          <TabsContent value="filters">
            {savedCategory && <CategoryFiltersPanel category={savedCategory} />}
          </TabsContent>
          <TabsContent value="flow">
            {savedCategory && <CategoryFlowPanel category={savedCategory} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDetailsPanel({
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
  onSaved: (saved: Category) => void;
}) {
  const [name, setName] = useState(category?.name_nb ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [parent, setParent] = useState<string>(category?.parent_id ?? parentId ?? "__none__");
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const filteredIconOptions = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return ALL_ICON_OPTIONS.slice(0, 100);
    return ALL_ICON_OPTIONS.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 100);
  }, [iconSearch]);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [color, setColor] = useState<string>(category?.color ?? "");
  const [headingFont, setHeadingFont] = useState<string>(
    category?.heading_font ?? DEFAULT_CATEGORY_HEADING_FONT,
  );
  const [searchExamples, setSearchExamples] = useState<string>(
    (category?.search_examples ?? []).join("\n"),
  );

  const save = useMutation({
    mutationFn: async () => {
      const newParentId = parent === "__none__" ? null : parent;
      const payload = {
        name_nb: name.trim(),
        slug: slug.trim() || slugify(name),
        parent_id: newParentId,
        icon,
        // Color and heading font only apply to main (top-level) categories.
        color: parent === "__none__" ? color.trim() || null : null,
        heading_font: parent === "__none__" ? headingFont : null,
        search_examples: searchExamples
          .split("\n")
          .map((w) => w.trim())
          .filter(Boolean),
      };
      if (category) {
        const { data, error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", category.id)
          .select(
            "id, name_nb, slug, parent_id, sort_order, icon, color, heading_font, search_examples",
          )
          .single();
        if (error) throw error;
        return data as Category;
      } else {
        // New categories are appended last within their sibling group;
        // drag-and-drop is the only way to reorder afterwards.
        const siblingMaxSortOrder = Math.max(
          0,
          ...categories
            .filter((c) => (c.parent_id ?? null) === newParentId)
            .map((c) => c.sort_order),
        );
        const { data, error } = await supabase
          .from("categories")
          .insert({ ...payload, sort_order: siblingMaxSortOrder + 10 })
          .select(
            "id, name_nb, slug, parent_id, sort_order, icon, color, heading_font, search_examples",
          )
          .single();
        if (error) throw error;
        return data as Category;
      }
    },
    onSuccess: (saved) => {
      showSuccessToast(category ? "Kategori oppdatert" : "Kategori opprettet");
      onSaved(saved);
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre kategorien")),
  });

  const excludedIds = category ? collectDescendantIds(categories, category.id) : new Set<string>();
  if (category) excludedIds.add(category.id);
  const possibleParents = categories
    .filter((c) => !excludedIds.has(c.id))
    .filter((c) => depthOf(c.id, categories) < MAX_CATEGORY_DEPTH - 1);

  return (
    <>
      {parentId && !category && (
        <p className="text-sm text-muted-foreground">Opprettes som underkategori.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            showErrorToast("Navn er påkrevd");
            return;
          }
          if (parent !== "__none__" && depthOf(parent, categories) >= MAX_CATEGORY_DEPTH - 1) {
            showErrorToast(`Maks kategoridybde er ${MAX_CATEGORY_DEPTH} nivåer`);
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
          {parent === "__none__" && slug.trim() && (
            <p className="text-xs text-muted-foreground">Landingsside: kaupet.no/{slug.trim()}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Ikon</Label>
          <Popover
            open={iconPickerOpen}
            onOpenChange={(open) => {
              setIconPickerOpen(open);
              if (!open) setIconSearch("");
            }}
          >
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
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Søk eller skriv inn ikon-navn…"
                  value={iconSearch}
                  onValueChange={setIconSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {iconSearch.trim() ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setIcon(iconSearch.trim());
                          setIconPickerOpen(false);
                        }}
                      >
                        Bruk «{iconSearch.trim()}» som ikon-navn
                      </button>
                    ) : (
                      "Ingen ikoner funnet"
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredIconOptions.map(({ name: iconName, icon: IconComponent }) => (
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
              Brukes som bakgrunn på landingssiden og som aksent på kategorisiden. La stå tom for å
              skjule kategorien som hovedkategori.
            </p>
          </div>
        )}
        {parent === "__none__" && (
          <div className="space-y-2">
            <Label htmlFor="heading-font">Overskriftsfont (hovedkategori)</Label>
            <Select value={headingFont} onValueChange={setHeadingFont}>
              <SelectTrigger id="heading-font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_HEADING_FONTS).map(([token, { label, stack }]) => (
                  <SelectItem key={token} value={token}>
                    <span style={{ fontFamily: stack }}>{label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Brukes på kategori-overskriften som vises på landingssiden når kategorien er valgt.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="search-examples">Eksempelsøkeord</Label>
          <Textarea
            id="search-examples"
            value={searchExamples}
            onChange={(e) => setSearchExamples(e.target.value)}
            placeholder={"iPhone 15\nPlayStation 5\nairpods"}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Ett ord/uttrykk per linje. Rulleres i søkefeltets typewriter-animasjon på landingssiden
            når kategorien er valgt. Tom liste faller tilbake til underkategorinavn.
          </p>
        </div>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Overordnet kategori</Label>
            <CategoryPicker
              open={parentPickerOpen}
              onOpenChange={setParentPickerOpen}
              categories={possibleParents}
              selectedId={parent}
              allowSelectAny
              onSelect={(categoryId) => setParent(categoryId)}
              trigger={
                <Button type="button" variant="outline" className="w-full justify-between">
                  {parent === "__none__"
                    ? "Ingen (toppnivå)"
                    : (categories.find((c) => c.id === parent)?.name_nb ??
                      "Velg overordnet kategori")}
                  <ChevronsUpDown className="size-4 opacity-50" />
                </Button>
              }
            />
            {parent !== "__none__" &&
              (color.trim() ||
                searchExamples.trim() ||
                headingFont !== DEFAULT_CATEGORY_HEADING_FONT) && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  Denne kategorien har farge, font eller søkeeksempler satt som hovedkategori. Disse
                  fjernes når du lagrer med en overordnet kategori valgt.
                </p>
              )}
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
    </>
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
  is_primary: boolean;
};

function SortableFilterRow({
  filter,
  onTogglePrimary,
  onEdit,
  onDelete,
}: {
  filter: CategoryFilter;
  onTogglePrimary: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: filter.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
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
        <div className="min-w-0">
          <span className="font-medium">{filter.label_nb}</span>{" "}
          <span className="text-xs text-muted-foreground">
            {FILTER_TYPE_LABELS[filter.type]}
            {filter.unit ? ` · ${filter.unit}` : ""} · {filter.key}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={filter.is_primary}
            onCheckedChange={(c) => onTogglePrimary(c === true)}
          />
          Vis alltid
        </label>
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Rediger">
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Slett"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function CategoryFiltersPanel({ category }: { category: Category }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EditableFilter | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);

  const {
    data: filters,
    isLoading,
    isError,
    error: filtersError,
  } = useQuery({
    queryKey: ["admin", "category-filters", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order, is_primary")
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
        is_primary: f.is_primary,
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

  const toggleIsPrimary = useMutation({
    mutationFn: async ({ id, is_primary }: { id: string; is_primary: boolean }) => {
      const { error } = await supabase.from("category_filters").update({ is_primary }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere filteret")),
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

  const reorderFilters = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("category_filters").update({ sort_order: u.sort_order }).eq("id", u.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre rekkefølgen")),
  });

  const filterSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleFilterDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = filters ?? [];
    const oldIndex = current.findIndex((f) => f.id === active.id);
    const newIndex = current.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(current, oldIndex, newIndex);
    reorderFilters.mutate(reordered.map((f, i) => ({ id: f.id, sort_order: (i + 1) * 10 })));
  }

  function startNew() {
    setKeyTouched(false);
    setDraft({
      key: "",
      label_nb: "",
      type: "select",
      unit: "",
      options: [{ value: "", label_nb: "" }],
      is_primary: true,
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
      is_primary: f.is_primary,
    });
  }

  const usesOptions = draft?.type === "select" || draft?.type === "multiselect";

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Filtre vises i annonseskjema og søk for denne kategorien og dens underkategorier.
      </p>

      {isLoading ? (
        <div className="space-y-2 py-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : isError ? (
        <p className="py-2 text-sm text-destructive">
          {formatErrorMessage(filtersError, "Kunne ikke laste filtre")}
        </p>
      ) : (
        <>
          {(filters ?? []).length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Ingen filtre ennå.</p>
          ) : (
            <DndContext
              sensors={filterSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFilterDragEnd}
            >
              <SortableContext
                items={(filters ?? []).map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-1">
                  {(filters ?? []).map((f) => (
                    <SortableFilterRow
                      key={f.id}
                      filter={f}
                      onTogglePrimary={(is_primary) =>
                        toggleIsPrimary.mutate({ id: f.id, is_primary })
                      }
                      onEdit={() => startEdit(f)}
                      onDelete={() => remove.mutate(f.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </>
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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.is_primary}
              onCheckedChange={(c) => setDraft((d) => (d ? { ...d, is_primary: c === true } : d))}
            />
            Vis alltid (av = under «Flere valg»)
          </label>
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
    </>
  );
}

const MODULE_KEYS = Object.keys(MODULE_REGISTRY);

/**
 * The only field groups whose relative order actually affects the wizard's
 * pagination (resolveWizardPages always pins title-photos first and
 * review-publish/delivery-location last, regardless of their array
 * position) — so this is the only set the admin UI lets an admin drag.
 */
const MIDDLE_FIELD_GROUP_KEYS = [
  "category-attributes",
  "condition",
  "price",
  "description-keywords",
];

function SortableFieldGroupRow({
  id,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md px-1 py-1">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="Dra for å endre rekkefølge"
      >
        <GripVertical className="size-4" />
      </button>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} />
        {FIELD_GROUP_LABELS_NB[id] ?? id}
      </label>
    </li>
  );
}

function FieldGroupPagesPreview({ label, pages }: { label: string; pages: string[][] }) {
  return (
    <p>
      <span className="font-medium text-foreground">{label}</span> — {pages.length}{" "}
      {pages.length === 1 ? "side" : "sider"}:{" "}
      {pages
        .map((p, i) => `${i + 1}) ${p.map((k) => FIELD_GROUP_LABELS_NB[k] ?? k).join(", ")}`)
        .join("  ")}
    </p>
  );
}

function CategoryFlowPanel({ category }: { category: Category }) {
  const qc = useQueryClient();

  const {
    data: flowRow,
    isLoading,
    isError,
    error: flowError,
  } = useQuery({
    queryKey: ["admin", "category-flow", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_flows")
        .select("id, category_id, field_groups, modules, sort_order")
        .eq("category_id", category.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [modules, setModules] = useState<string[] | null>(null);
  const activeModules = modules ?? flowRow?.modules ?? DEFAULT_MODULES;
  const hasCustomFlow = !!flowRow;

  const [fieldGroups, setFieldGroups] = useState<string[] | null>(null);
  const storedFieldGroups = fieldGroups ?? flowRow?.field_groups ?? DEFAULT_FIELD_GROUPS;
  const middleOrder = [
    ...storedFieldGroups.filter((k) => MIDDLE_FIELD_GROUP_KEYS.includes(k)),
    ...MIDDLE_FIELD_GROUP_KEYS.filter((k) => !storedFieldGroups.includes(k)),
  ];
  const deliveryActive = storedFieldGroups.includes("delivery-location");
  // vehicle-registration (Statens vegvesen-oppslag for Bil og MC) isn't part
  // of MIDDLE_FIELD_GROUP_KEYS — this simple editor doesn't support letting
  // admins reorder/toggle it yet — but it must survive a save if the
  // category already has it (seeded via migration), or the vehicle-first
  // flow silently breaks the next time someone touches this dialog.
  const hasVehicleRegistration = storedFieldGroups.includes("vehicle-registration");
  const activeFieldGroups = [
    ...(hasVehicleRegistration ? ["vehicle-registration"] : []),
    "title-photos",
    ...middleOrder.filter(
      (k) => LOCKED_FIELD_GROUP_KEYS.includes(k) || storedFieldGroups.includes(k),
    ),
    ...(deliveryActive ? ["delivery-location"] : []),
    "review-publish",
  ];

  const fieldGroupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin", "category-flow", category.id] });

  const save = useMutation({
    mutationFn: async ({
      nextModules,
      nextFieldGroups,
    }: {
      nextModules: string[];
      nextFieldGroups: string[];
    }) => {
      const { error } = await supabase
        .from("category_flows")
        .upsert(
          { category_id: category.id, field_groups: nextFieldGroups, modules: nextModules },
          { onConflict: "category_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Annonseflyt lagret");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre annonseflyten")),
  });

  const resetToDefault = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("category_flows")
        .delete()
        .eq("category_id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Tilbakestilt til standardflyt");
      setModules(null);
      setFieldGroups(null);
      invalidate();
    },
    onError: (e: Error) =>
      showErrorToast(formatErrorMessage(e, "Kunne ikke tilbakestille annonseflyten")),
  });

  function toggle(key: string) {
    const current = modules ?? flowRow?.modules ?? DEFAULT_MODULES;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setModules(next);
  }

  function toggleFieldGroup(key: string) {
    if (LOCKED_FIELD_GROUP_KEYS.includes(key)) return;
    const next = storedFieldGroups.includes(key)
      ? storedFieldGroups.filter((k) => k !== key)
      : [...storedFieldGroups, key];
    setFieldGroups(next);
  }

  function handleFieldGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = middleOrder.indexOf(String(active.id));
    const newIndex = middleOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(middleOrder, oldIndex, newIndex);
    setFieldGroups([
      "title-photos",
      ...reordered.filter(
        (k) => LOCKED_FIELD_GROUP_KEYS.includes(k) || storedFieldGroups.includes(k),
      ),
      ...(deliveryActive ? ["delivery-location"] : []),
      "review-publish",
    ]);
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Velg og sorter hvilke feltgrupper og moduler som vises i annonseskjemaet for denne
        kategorien og dens underkategorier. Uten egen flyt her arves nærmeste overordnede kategoris
        flyt, eller standardflyten hvis ingen har en.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="py-2 text-sm text-destructive">
          {formatErrorMessage(flowError, "Kunne ikke laste annonseflyten")}
        </p>
      ) : (
        <div className="space-y-4">
          {!hasCustomFlow && (
            <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              Denne kategorien har ingen egen flyt ennå — bruker standardflyten (eller nærmeste
              overordnede kategoris flyt, hvis satt).
            </p>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Feltgrupper</p>
            {hasVehicleRegistration && (
              <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                Denne kategorien har kjøretøyregistrering (Statens vegvesen-oppslag) satt opp via
                migrasjon. Bekreftelsessteget som vises etter et vellykket oppslag legges alltid til
                automatisk og kan ikke konfigureres her.
              </p>
            )}
            <ul>
              {hasVehicleRegistration && (
                <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                  <span className="inline-block size-4 shrink-0" aria-hidden />
                  <Checkbox checked disabled />
                  {FIELD_GROUP_LABELS_NB["vehicle-registration"]}
                  <span className="text-xs">(alltid først, kan ikke fjernes her)</span>
                </li>
              )}
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <Checkbox checked disabled />
                {FIELD_GROUP_LABELS_NB["title-photos"]}
                <span className="text-xs">(alltid først)</span>
              </li>
            </ul>
            <DndContext
              sensors={fieldGroupSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFieldGroupDragEnd}
            >
              <SortableContext items={middleOrder} strategy={verticalListSortingStrategy}>
                <ul>
                  {middleOrder.map((key) => (
                    <SortableFieldGroupRow
                      key={key}
                      id={key}
                      checked={
                        LOCKED_FIELD_GROUP_KEYS.includes(key) || storedFieldGroups.includes(key)
                      }
                      disabled={LOCKED_FIELD_GROUP_KEYS.includes(key)}
                      onToggle={() => toggleFieldGroup(key)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            <ul>
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={deliveryActive}
                    onCheckedChange={() => toggleFieldGroup("delivery-location")}
                  />
                  {FIELD_GROUP_LABELS_NB["delivery-location"]}
                </label>
              </li>
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <Checkbox checked disabled />
                {FIELD_GROUP_LABELS_NB["review-publish"]}
                <span className="text-xs">(alltid sist)</span>
              </li>
            </ul>
          </div>

          <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Forhåndsvisning av annonseskjemaet</p>
            <FieldGroupPagesPreview
              label="Web"
              pages={resolveWizardPages(activeFieldGroups, { native: false })}
            />
            <FieldGroupPagesPreview
              label="Native"
              pages={resolveWizardPages(activeFieldGroups, { native: true })}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Moduler</p>
            <ul className="space-y-2">
              {MODULE_KEYS.map((key) => (
                <li key={key}>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={activeModules.includes(key)}
                      onCheckedChange={() => toggle(key)}
                    />
                    {MODULE_LABELS_NB[key] ?? key}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {hasCustomFlow && (
          <Button
            type="button"
            variant="outline"
            onClick={() => resetToDefault.mutate()}
            disabled={resetToDefault.isPending}
          >
            {resetToDefault.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Tilbakestill til standard"
            )}
          </Button>
        )}
        <Button
          type="button"
          disabled={save.isPending || isLoading}
          onClick={() =>
            save.mutate({ nextModules: activeModules, nextFieldGroups: activeFieldGroups })
          }
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre"}
        </Button>
      </DialogFooter>
    </>
  );
}
