import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Languages, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FILTER_TYPE_LABELS, type CategoryFilter } from "@/lib/category-filters";

/** Filter types whose values can be recognized as search-phrase synonyms —
 * "range"/"number"/"text" values aren't a fixed vocabulary, so a synonym
 * dictionary doesn't apply to them. */
const SYNONYM_ELIGIBLE_TYPES: CategoryFilter["type"][] = ["select", "multiselect", "boolean"];

export function SortableFilterRow({
  filter,
  onTogglePrimary,
  onEdit,
  onDelete,
  onEditSynonyms,
}: {
  filter: CategoryFilter;
  onTogglePrimary: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onEditSynonyms: () => void;
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
        {SYNONYM_ELIGIBLE_TYPES.includes(filter.type) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEditSynonyms}
            aria-label="Synonymer for søk"
            title="Synonymer for søk"
          >
            <Languages className="size-4" />
          </Button>
        )}
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
