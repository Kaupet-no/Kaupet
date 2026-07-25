import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryDetailsPanel } from "./category-details-panel";
import { CategoryFiltersPanel } from "./category-filters-panel";
import { CategoryFlowPanel } from "./category-flow-panel";
import type { Category } from "./shared";

export function CategoryDialog({
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
  const [dialogEl, setDialogEl] = useState<HTMLDivElement | null>(null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent ref={setDialogEl} className="max-h-[85vh] overflow-y-auto">
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
              dialogEl={dialogEl}
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
