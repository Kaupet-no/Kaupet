import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FolderTree, Loader2, Plus, Workflow } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { getProjection } from "@/lib/category-admin-tree";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { flattenTree } from "@/lib/category-admin-tree";
import { DefaultSearchExamplesCard } from "@/components/admin/categories/default-search-examples-card";
import { SortableCategoryRow } from "@/components/admin/categories/sortable-category-row";
import { CategoryDialog } from "@/components/admin/categories/category-dialog";
import type { Category } from "@/components/admin/categories/shared";
import { INDENT_WIDTH } from "@/components/admin/categories/shared";

export const Route = createFileRoute("/_authenticated/admin/kategorier")({
  head: () => ({ meta: [{ title: "Kategoriadministrasjon — Kaupet.no" }] }),
  component: AdminCategories,
});

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
          "id, name_nb, slug, parent_id, sort_order, icon, color, heading_font, search_examples, is_hidden",
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
