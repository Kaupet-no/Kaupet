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

export function CategoryPicker({
  open,
  onOpenChange,
  categories,
  selectedId,
  onSelect,
  trigger,
}: Props) {
  const isDesktop = useIsDesktop();
  const [parentId, setParentId] = useState<string | null>(null);
  const [hoveredParentId, setHoveredParentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const parents = categories.filter((c) => !c.parent_id);
  const children = categories.filter((c) => c.parent_id === parentId);

  const filteredParents = search.trim()
    ? parents.filter((c) => c.name_nb.toLowerCase().includes(search.toLowerCase()))
    : parents;

  const filteredChildren = search.trim()
    ? children.filter((c) => c.name_nb.toLowerCase().includes(search.toLowerCase()))
    : children;

  function handleParentClick(id: string) {
    const hasSubs = categories.some((c) => c.parent_id === id);
    if (hasSubs) {
      setParentId(id);
      setSearch("");
    } else {
      onSelect(id, id);
      onOpenChange(false);
      resetState();
    }
  }

  function handleChildClick(child: Category) {
    onSelect(child.id, child.parent_id!);
    onOpenChange(false);
    resetState();
  }

  function handleBack() {
    setParentId(null);
    setSearch("");
  }

  function resetState() {
    setParentId(null);
    setHoveredParentId(null);
    setSearch("");
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetState();
    onOpenChange(v);
  }

  const activeParent = parentId ? parents.find((p) => p.id === parentId) : null;

  // Desktop: two-column layout
  if (isDesktop) {
    const desktopHoverId = hoveredParentId ?? parentId;
    const desktopChildren = desktopHoverId
      ? categories.filter((c) => c.parent_id === desktopHoverId)
      : [];

    const searchResults = search.trim()
      ? categories.filter((c) => c.name_nb.toLowerCase().includes(search.toLowerCase()))
      : null;

    const desktopContent = (
      <>
        {/* Search */}
        <div className="relative p-3 border-b shrink-0">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Søk i kategorier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {searchResults ? (
          /* Flat search results */
          <div className="overflow-y-auto p-2 space-y-0.5">
            {searchResults.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Ingen kategorier funnet
              </p>
            )}
            {searchResults.map((cat) => {
              const isSelected = selectedId === cat.id;
              const parent = cat.parent_id ? parents.find((p) => p.id === cat.parent_id) : null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    cat.parent_id ? handleChildClick(cat) : handleParentClick(cat.id)
                  }
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                  }`}
                >
                  <span>
                    {parent && <span className="text-muted-foreground">{parent.name_nb} / </span>}
                    {cat.name_nb}
                  </span>
                  {isSelected && <Check className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          /* Two-column layout */
          <div className="flex flex-1 min-h-0">
            {/* Left: parent categories */}
            <div className="w-48 border-r overflow-y-auto p-2 space-y-0.5 shrink-0">
              {filteredParents.map((cat) => {
                const hasSubs = categories.some((c) => c.parent_id === cat.id);
                const isActive = desktopHoverId === cat.id;
                const isSelected = selectedId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleParentClick(cat.id)}
                    onMouseEnter={() => hasSubs && setHoveredParentId(cat.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-muted font-medium"
                        : isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted"
                    }`}
                  >
                    <span>{cat.name_nb}</span>
                    {hasSubs ? (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : isSelected ? (
                      <Check className="size-3.5 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Right: subcategories */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {desktopChildren.length === 0 && desktopHoverId && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Ingen underkategorier
                </p>
              )}
              {desktopChildren.length === 0 && !desktopHoverId && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Hold musepekeren over en kategori
                </p>
              )}
              {desktopChildren.map((cat) => {
                const isSelected = selectedId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleChildClick(cat)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                    }`}
                  >
                    <span>{cat.name_nb}</span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </>
    );

    if (trigger) {
      return (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="p-0 w-[480px] max-h-[500px] flex flex-col" align="start">
            {desktopContent}
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="p-0 max-w-[480px] h-[500px] flex flex-col gap-0">
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
            {parentId && (
              <button
                type="button"
                onClick={handleBack}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                aria-label="Tilbake til kategorier"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <SheetTitle className="text-left">
              {activeParent ? activeParent.name_nb : "Velg kategori"}
            </SheetTitle>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Søk i kategorier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {!parentId || search.trim() ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {filteredParents.map((cat) => {
                const isSelected = selectedId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleParentClick(cat.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <span>{cat.name_nb}</span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1 pt-1">
              {filteredChildren.map((cat) => {
                const isSelected = selectedId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleChildClick(cat)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <span>{cat.name_nb}</span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
              {filteredChildren.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Ingen underkategorier
                </p>
              )}
            </div>
          )}

          {filteredParents.length === 0 && search.trim() && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ingen kategorier funnet
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
