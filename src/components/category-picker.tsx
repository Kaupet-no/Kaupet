import { useState } from "react";
import { Check, ChevronLeft, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
};

export function CategoryPicker({ open, onOpenChange, categories, selectedId, onSelect }: Props) {
  const [parentId, setParentId] = useState<string | null>(null);
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
      setParentId(null);
    }
  }

  function handleChildClick(child: Category) {
    onSelect(child.id, child.parent_id!);
    onOpenChange(false);
    setParentId(null);
  }

  function handleBack() {
    setParentId(null);
    setSearch("");
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setParentId(null);
      setSearch("");
    }
    onOpenChange(v);
  }

  const activeParent = parentId ? parents.find((p) => p.id === parentId) : null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
            /* Parent categories (or search results across all) */
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
            /* Subcategories */
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
