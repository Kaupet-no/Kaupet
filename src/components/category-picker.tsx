import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getCategoryIcon } from "@/lib/category-icons";

type Category = {
  id: string;
  name_nb: string;
  parent_id: string | null;
  icon?: string | null;
  color?: string | null;
};

/** How long the checkmark confirmation is shown on the picked item before
 * `onSelect` fires and the picker closes. Gives the user visible feedback
 * that their tap registered before the page navigates away. */
const SELECTION_CONFIRM_MS = 320;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  selectedId: string;
  onSelect: (categoryId: string, parentId: string) => void;
  /** Called instead of re-expanding locally when the user clicks the
   * already-selected, collapsed card in the grid. If omitted, clicking that
   * card just re-reveals the other options (no confirmation, selection
   * untouched) — the caller owns confirming/clearing when provided. */
  onDeselect?: (parentId: string) => void;
  trigger?: React.ReactNode;
  /** Renders the drill-down list + search directly in the page flow, with no
   * Dialog/Sheet/Popover wrapper. Used for the category-select field group,
   * where category choice is the page content rather than a triggered
   * overlay. `open`/`onOpenChange`/`trigger` are ignored in this mode. */
  inline?: boolean;
  /** Category ids that should be selectable as a terminal choice even though
   * they have children — e.g. "Bil og MC" itself, so the vehicle-first flow
   * can treat picking the top-level vehicle category as done, deferring the
   * actual leaf (bil/motorsykkel/...) to the Statens Vegvesen lookup
   * instead of forcing manual drill-down. */
  selectableGroups?: string[];
  /** Admin use case (choosing a *parent* category rather than a leaf): shows
   * a pinned "select this level" row at the top of every level (including
   * the root, as "Ingen (toppnivå)"), so any category — not just leaves —
   * can be the final choice, while drilling down to inspect children still
   * works via the normal grid/list clicks. */
  allowSelectAny?: boolean;
  /** Seeds the drill-down at this category's children instead of the root —
   * e.g. when the surrounding step has already scoped the user to "Bil og
   * MC" and the root category itself shouldn't be shown as a choice again.
   * The back button never goes above this level. */
  initialParentId?: string;
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/**
 * Lets the user drill down through an arbitrary number of category levels
 * (main category -> subcategory -> leaf, ...), selecting only once they
 * reach a category with no children of its own. Filters live on leaf
 * categories, so this must be able to reach any depth, not just 2 levels.
 */
export function CategoryPicker({
  open,
  onOpenChange,
  categories,
  selectedId,
  onSelect,
  onDeselect,
  trigger,
  inline,
  selectableGroups,
  allowSelectAny,
  initialParentId,
}: Props) {
  const isDesktop = useIsDesktop();
  const initialPath = useMemo(() => {
    if (!initialParentId) return [];
    const root = categories.find((c) => c.id === initialParentId);
    return root ? [root] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParentId]);
  const [path, setPath] = useState<Category[]>(initialPath);
  const [search, setSearch] = useState("");
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  const currentParentId = path.at(-1)?.id ?? null;
  const currentLevel = categories.filter((c) => c.parent_id === currentParentId);

  const filteredCurrentLevel = search.trim()
    ? currentLevel.filter((c) => c.name_nb.toLowerCase().includes(search.toLowerCase()))
    : currentLevel;

  /** Once a category at this level is selected, the grid collapses to just
   * that card (highlighted) instead of leaving every sibling visible with no
   * visual confirmation. Clicking the highlighted card again re-expands the
   * level and clears the highlight — it does not change the selection. */
  const [manualExpand, setManualExpand] = useState(false);
  useEffect(() => {
    setManualExpand(false);
  }, [currentParentId]);
  const selectedInLevel = filteredCurrentLevel.find((c) => c.id === selectedId);
  const gridLevel = !manualExpand && selectedInLevel ? [selectedInLevel] : filteredCurrentLevel;

  const searchResults = search.trim()
    ? categories.filter((c) => c.name_nb.toLowerCase().includes(search.toLowerCase()))
    : null;

  function hasChildren(id: string) {
    return categories.some((c) => c.parent_id === id);
  }

  /** In inline mode the picker never closes, so fully resetting the drilled
   * path after a selection (as the Sheet/Dialog/Popover variants do to
   * prepare for next time they open) would snap the grid back up to the
   * scoped root — looking exactly like nothing had been picked yet, even
   * though `onSelect` already fired. Inline just clears the transient
   * pending/search state and leaves `path` where the user drilled to, so the
   * chosen leaf stays visible (highlighted via `selectedId`) at its parent
   * level. */
  function finishSelection() {
    if (inline) {
      setPendingSelection(null);
      setSearch("");
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
    } else {
      resetState();
    }
  }

  function handleItemClick(item: Category) {
    if (pendingSelection) return;
    if (hasChildren(item.id) && !selectableGroups?.includes(item.id)) {
      setPath((p) => [...p, item]);
      setSearch("");
    } else {
      setPendingSelection(item.id);
      confirmTimeoutRef.current = setTimeout(() => {
        onSelect(item.id, currentParentId ?? item.id);
        onOpenChange(false);
        finishSelection();
      }, SELECTION_CONFIRM_MS);
    }
  }

  function handleSelectCurrentLevel() {
    if (pendingSelection) return;
    const id = currentParentId ?? "__none__";
    setPendingSelection(id);
    confirmTimeoutRef.current = setTimeout(() => {
      onSelect(id, currentParentId ?? id);
      onOpenChange(false);
      finishSelection();
    }, SELECTION_CONFIRM_MS);
  }

  function handleBack() {
    setPath((p) => (p.length > initialPath.length ? p.slice(0, -1) : p));
    setSearch("");
  }

  function resetState() {
    setPath(initialPath);
    setSearch("");
    setPendingSelection(null);
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetState();
    onOpenChange(v);
  }

  function categoryParentLabel(cat: Category): string | null {
    const parent = cat.parent_id ? categories.find((p) => p.id === cat.parent_id) : null;
    if (!parent) return null;
    const grandparent = parent.parent_id ? categories.find((p) => p.id === parent.parent_id) : null;
    return grandparent ? `${grandparent.name_nb} / ${parent.name_nb}` : parent.name_nb;
  }

  const breadcrumb = path.map((p) => p.name_nb).join(" › ");

  /** Every drill-down level (main → sub → leaf) is shown as a visual grid of
   * icon/color cards, so the picker stays "pretty visual" all the way down —
   * only a live search (which spans multiple parents) falls back to the
   * compact list, since a grid doesn't suit mixed-breadcrumb results. */
  const showGrid = !searchResults;

  function rowItem(cat: Category, opts: { parentLabel?: string | null } = {}) {
    const isSelected = selectedId === cat.id;
    const isPending = pendingSelection === cat.id;
    return (
      <button
        key={cat.id}
        type="button"
        onClick={() => handleItemClick(cat)}
        disabled={!!pendingSelection}
        data-testid="category-tile"
        data-category-name={cat.name_nb}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
          isPending
            ? "bg-primary/15 text-primary font-medium ring-1 ring-primary/40"
            : isSelected
              ? "bg-primary/10 text-primary font-medium"
              : "hover:bg-muted"
        }`}
      >
        <span>
          {opts.parentLabel && <span className="text-muted-foreground">{opts.parentLabel} / </span>}
          {cat.name_nb}
        </span>
        {isPending || isSelected ? (
          <Check
            className={`size-4 shrink-0 transition-transform ${isPending ? "scale-125" : ""}`}
          />
        ) : hasChildren(cat.id) ? (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </button>
    );
  }

  const drillDownContent = (
    <>
      {/* Search */}
      <div className="relative p-3 border-b shrink-0">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          data-testid="category-search-input"
          placeholder="Søk i kategorier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          autoFocus={isDesktop}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {allowSelectAny && !searchResults && (
          <button
            type="button"
            onClick={handleSelectCurrentLevel}
            disabled={!!pendingSelection}
            className={`mb-2 flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-left text-sm transition-colors ${
              pendingSelection === (currentParentId ?? "__none__")
                ? "border-primary bg-primary/15 text-primary font-medium"
                : selectedId === (currentParentId ?? "__none__")
                  ? "border-primary/40 bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted"
            }`}
          >
            <span>{path.length > 0 ? `Velg «${path.at(-1)!.name_nb}»` : "Ingen (toppnivå)"}</span>
            {pendingSelection === (currentParentId ?? "__none__") && (
              <Check className="size-4 shrink-0" />
            )}
          </button>
        )}
        {searchResults ? (
          <div className="space-y-0.5">
            {searchResults.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Ingen kategorier funnet
              </p>
            )}
            {searchResults.map((cat) => rowItem(cat, { parentLabel: categoryParentLabel(cat) }))}
          </div>
        ) : showGrid ? (
          <div className="grid grid-cols-2 gap-2 p-1 sm:grid-cols-3">
            {gridLevel.map((cat) => {
              const isPending = pendingSelection === cat.id;
              const isSelected = !manualExpand && selectedId === cat.id;
              const highlighted = isPending || isSelected;
              const Icon = getCategoryIcon(cat.icon);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    if (isSelected && !isPending) {
                      if (onDeselect) onDeselect(currentParentId ?? "");
                      else setManualExpand(true);
                    } else {
                      handleItemClick(cat);
                    }
                  }}
                  disabled={!!pendingSelection}
                  data-testid="category-tile"
                  data-category-name={cat.name_nb}
                  className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-colors ${
                    highlighted
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                      : "border-border hover:border-primary/40 hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`flex size-11 items-center justify-center rounded-full transition-transform ${
                      highlighted ? "scale-110" : ""
                    } ${cat.color ? "" : highlighted ? "bg-primary/20" : "bg-primary/10"}`}
                    style={{
                      backgroundColor: cat.color
                        ? highlighted
                          ? cat.color
                          : `color-mix(in oklch, ${cat.color} 16%, transparent)`
                        : undefined,
                      color: cat.color && highlighted ? "white" : cat.color || undefined,
                    }}
                  >
                    {highlighted ? (
                      <Check className={`size-5 ${cat.color ? "" : "text-primary"}`} />
                    ) : (
                      <Icon className={`size-5 ${cat.color ? "" : "text-primary"}`} />
                    )}
                  </span>
                  <span className="text-sm font-medium leading-tight">{cat.name_nb}</span>
                </button>
              );
            })}
            {filteredCurrentLevel.length === 0 && (
              <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
                Ingen underkategorier
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredCurrentLevel.map((cat) => rowItem(cat))}
            {filteredCurrentLevel.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Ingen underkategorier
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="flex h-full min-h-[420px] flex-col rounded-lg border border-border">
        {path.length > initialPath.length && (
          <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
            <button
              type="button"
              onClick={handleBack}
              className="native-hit-area flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
              aria-label="Tilbake til kategorier"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-medium">{breadcrumb}</span>
          </div>
        )}
        {drillDownContent}
      </div>
    );
  }

  // Desktop: single-column drill-down dialog/popover
  if (isDesktop) {
    const desktopContent = (
      <div className="flex flex-col h-full">
        {path.length > initialPath.length && (
          <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
            <button
              type="button"
              onClick={handleBack}
              className="native-hit-area flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
              aria-label="Tilbake til kategorier"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-medium">{breadcrumb}</span>
          </div>
        )}
        {drillDownContent}
      </div>
    );

    if (trigger) {
      return (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="p-0 w-[380px] max-h-[500px] flex flex-col" align="start">
            {desktopContent}
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="p-0 max-w-[380px] h-[500px] flex flex-col gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Velg kategori</DialogTitle>
          </DialogHeader>
          {desktopContent}
        </DialogContent>
      </Dialog>
    );
  }

  // Mobile: bottom sheet
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {trigger}
      <SheetContent side="bottom" expandable className="rounded-t-2xl flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            {path.length > initialPath.length && (
              <button
                type="button"
                onClick={handleBack}
                className="native-touch-target flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                aria-label="Tilbake til kategorier"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <SheetTitle className="text-left">{breadcrumb || "Velg kategori"}</SheetTitle>
          </div>
        </SheetHeader>
        <div className="flex flex-1 flex-col min-h-0">{drillDownContent}</div>
      </SheetContent>
    </Sheet>
  );
}
