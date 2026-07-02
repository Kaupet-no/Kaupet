import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Category = {
  id: string;
  name_nb: string;
  parent_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  selectedId: string;
  onSelect: (categoryId: string, parentId: string) => void;
  trigger?: React.ReactNode;
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
  trigger,
}: Props) {
  const isDesktop = useIsDesktop();
  const [path, setPath] = useState<Category[]>([]);
  const [search, setSearch] = useState("");

  const currentParentId = path.at(-1)?.id ?? null;
  const currentLevel = categories.filter((c) => c.parent_id === currentParentId);

  const filteredCurrentLevel = search.trim()
    ? currentLevel.filter((c) => c.name_nb.toLowerCase().includes(search.toLowerCase()))
    : currentLevel;

  const searchResults = search.trim()
    ? categories.filter((c) => c.name_nb.toLowerCase().includes(search.toLowerCase()))
    : null;

  function hasChildren(id: string) {
    return categories.some((c) => c.parent_id === id);
  }

  function handleItemClick(item: Category) {
    if (hasChildren(item.id)) {
      setPath((p) => [...p, item]);
      setSearch("");
    } else {
      onSelect(item.id, currentParentId ?? item.id);
      onOpenChange(false);
      resetState();
    }
  }

  function handleBack() {
    setPath((p) => p.slice(0, -1));
    setSearch("");
  }

  function resetState() {
    setPath([]);
    setSearch("");
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

  const drillDownContent = (
    <>
      {/* Search */}
      <div className="relative p-3 border-b shrink-0">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Søk i kategorier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          autoFocus={isDesktop}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {searchResults ? (
          <>
            {searchResults.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Ingen kategorier funnet
              </p>
            )}
            {searchResults.map((cat) => {
              const isSelected = selectedId === cat.id;
              const parentLabel = categoryParentLabel(cat);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleItemClick(cat)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                  }`}
                >
                  <span>
                    {parentLabel && <span className="text-muted-foreground">{parentLabel} / </span>}
                    {cat.name_nb}
                  </span>
                  {isSelected ? (
                    <Check className="size-4 shrink-0" />
                  ) : hasChildren(cat.id) ? (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              );
            })}
          </>
        ) : (
          <>
            {filteredCurrentLevel.map((cat) => {
              const isSelected = selectedId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleItemClick(cat)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                  }`}
                >
                  <span>{cat.name_nb}</span>
                  {hasChildren(cat.id) ? (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : isSelected ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : null}
                </button>
              );
            })}
            {filteredCurrentLevel.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Ingen underkategorier
              </p>
            )}
          </>
        )}
      </div>
    </>
  );

  // Desktop: single-column drill-down dialog/popover
  if (isDesktop) {
    const desktopContent = (
      <div className="flex flex-col h-full">
        {path.length > 0 && (
          <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
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
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            {path.length > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
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
