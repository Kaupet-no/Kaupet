import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2, Plus, X } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatErrorMessage } from "@/lib/errors";
import {
  FILTER_TYPE_LABELS,
  normalizeFilter,
  type CategoryFilter,
  type FilterType,
} from "@/lib/category-filters";
import { SortableFilterRow } from "./sortable-filter-row";
import { FilterSynonymsDialog } from "./filter-synonyms-dialog";
import { SuggestValuesButton } from "./suggest-values-button";
import { FILTER_TYPES, filterKeyify, type Category, type EditableFilter } from "./shared";

export function CategoryFiltersPanel({ category }: { category: Category }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EditableFilter | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [synonymsFilter, setSynonymsFilter] = useState<CategoryFilter | null>(null);

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
        .select(
          "id, category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value",
        )
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
                      onEditSynonyms={() => setSynonymsFilter(f)}
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
          {(draft.type === "text" || usesOptions) && draft.key.trim() && (
            <SuggestValuesButton
              categoryId={category.id}
              filterKey={draft.key.trim()}
              onApply={(suggested) =>
                setDraft((d) => {
                  if (!d) return d;
                  const existingValues = new Set(d.options.map((o) => o.value));
                  const merged = [
                    ...d.options.filter((o) => o.value.trim() || o.label_nb.trim()),
                    ...suggested.filter((o) => !existingValues.has(o.value)),
                  ];
                  return {
                    ...d,
                    type: d.type === "text" ? "select" : d.type,
                    options: merged.length > 0 ? merged : [{ value: "", label_nb: "" }],
                  };
                })
              }
            />
          )}
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

      {synonymsFilter && (
        <FilterSynonymsDialog
          filter={synonymsFilter}
          open={!!synonymsFilter}
          onOpenChange={(open) => !open && setSynonymsFilter(null)}
        />
      )}
    </>
  );
}
