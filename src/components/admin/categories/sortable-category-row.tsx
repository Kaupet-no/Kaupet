import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/lib/category-icons";
import { MAX_CATEGORY_DEPTH } from "@/lib/category-admin-tree";
import { INDENT_WIDTH, type Category } from "./shared";

export function SortableCategoryRow({
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
  readOnly = false,
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
  /** Produksjon: kategorier redigeres kun i staging og synkroniseres hit. */
  readOnly?: boolean;
}) {
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
          {readOnly ? (
            <span className="inline-block size-4" aria-hidden />
          ) : (
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
              aria-label="Dra for å endre rekkefølge og nivå"
            >
              <GripVertical className="size-4" />
            </button>
          )}
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
          <CategoryIcon
            iconName={category.icon}
            className="size-4 shrink-0 text-muted-foreground"
          />
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
          {!readOnly && depth < MAX_CATEGORY_DEPTH - 1 && (
            <Button variant="ghost" size="sm" onClick={() => onAddChild(category)}>
              <Plus className="size-4" /> Underkategori
            </Button>
          )}
          {!readOnly && (
            <>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(category)}
                aria-label="Rediger"
              >
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
            </>
          )}
        </div>
      </div>
    </li>
  );
}
