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
import { CategoryPicker } from "@/components/category-picker";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { saveListingField } from "./save-listing-field";
import { getCategoryBehavior } from "@/lib/category-behavior";

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

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, slug, parent_id, icon, color")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
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

  async function handleSelect(newCategoryId: string) {
    if (saving || newCategoryId === currentCategoryId) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      // Attributes are intentionally kept as-is here (server-side RLS still
      // scopes writes to the owner) — a full filter-key validity check
      // against the new category's `category_filters` would need the same
      // registry used by the create wizard; kept minimal for now and safe
      // because stale attribute keys not read by the new category's field
      // groups are simply ignored, not exposed anywhere.
      await saveListingField(
        listingId,
        { group: "category", category_id: newCategoryId, attributes: {} },
        { behavior: getCategoryBehavior(null) },
      );
      await queryClient.invalidateQueries({ queryKey: ["listing", kaupetCode] });
      showSuccessToast("Kategori oppdatert");
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
    </Dialog>
  );
}
