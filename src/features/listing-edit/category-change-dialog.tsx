import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CategoryPicker } from "@/components/category-picker";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { saveListingField } from "./save-listing-field";
import { getCategoryBehavior } from "@/lib/category-behavior";
import { useIsDemo } from "@/hooks/use-is-demo";

/**
 * Modal for changing the listing's category — not inline, since switching
 * category can change which other sections even show (vehicle vs generic
 * attributes, delivery-method requirement), which would be inconsistent to
 * do mid-page while the rest of the view still reflects the old category.
 */
export function CategoryChangeDialog({
  open,
  onOpenChange,
  listingId,
  kaupetCode,
  currentCategoryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  kaupetCode: string;
  currentCategoryId: string | null;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);

  const { data: isDemo = false } = useIsDemo();
  const { data: categories } = useQuery({
    queryKey: ["categories", "with-hidden-flag"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, slug, parent_id, icon, color, is_hidden")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
    // Hidden categories (e.g. the E2E test category) are only pickable for
    // demo/admin users.
    select: (rows) => rows.filter((c) => isDemo || !c.is_hidden),
  });

  // Only subcategories may be changed inline — switching main category is a
  // bigger structural change (different field groups, attributes, wizard
  // flow entirely) than this dialog is meant to handle. Seed the picker at
  // the current listing's top-level category so the drill-down (and its
  // "back" button) never reaches the main-category grid.
  const rootCategoryId = useMemo(() => {
    if (!categories || !currentCategoryId) return undefined;
    const byId = new Map(categories.map((c) => [c.id, c]));
    let cur = byId.get(currentCategoryId);
    if (!cur) return undefined;
    while (cur.parent_id) {
      const parent = byId.get(cur.parent_id);
      if (!parent) break;
      cur = parent;
    }
    return cur.id;
  }, [categories, currentCategoryId]);

  function handleSelect(newCategoryId: string) {
    if (newCategoryId === currentCategoryId) {
      onOpenChange(false);
      return;
    }
    setPendingCategoryId(newCategoryId);
  }

  async function confirmChange() {
    const newCategoryId = pendingCategoryId;
    if (saving || !newCategoryId) return;
    setSaving(true);
    try {
      // Attributes are wiped, not carried over — a category's attributes are
      // only meaningful against its own `category_filters`, and a full
      // filter-key remap would need the same registry the create wizard
      // uses. The confirmation dialog above tells the user this happens.
      await saveListingField(
        listingId,
        { group: "category", category_id: newCategoryId, attributes: {} },
        { behavior: getCategoryBehavior(null) },
      );
      await queryClient.invalidateQueries({ queryKey: ["listing", kaupetCode] });
      showSuccessToast("Kategori oppdatert");
      setPendingCategoryId(null);
      onOpenChange(false);
    } catch (e) {
      showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere kategori"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Endre kategori</DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <span>
                Felter som ikke finnes i den nye kategorien kan forsvinne fra annonsen. Sjekk de
                andre feltene etter at du har byttet.
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>
        <CategoryPicker
          open={open}
          onOpenChange={onOpenChange}
          categories={categories ?? []}
          selectedId={currentCategoryId ?? ""}
          onSelect={handleSelect}
          initialParentId={rootCategoryId}
          inline
        />
      </DialogContent>

      <AlertDialog
        open={!!pendingCategoryId}
        onOpenChange={(o) => !o && setPendingCategoryId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bytte kategori?</AlertDialogTitle>
            <AlertDialogDescription>
              Egenskaper som er fylt ut for gjeldende kategori (spesifikasjoner, utstyr o.l.) blir
              slettet og kan ikke gjenopprettes. Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => void confirmChange()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Bytt kategori
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
