import { Sparkles } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/category-picker";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * Always-first step: category must be chosen before title/photos, since the
 * title step itself branches on category (structured title for vehicle
 * categories). Renders CategoryPicker inline (list + live search) rather than
 * behind a trigger button, per the "ask the user to pick a category first"
 * requirement.
 */
export function CategorySelect({
  errors,
  native,
  categories,
  categoryId,
  onCategorySelect,
  categorySuggestions,
  categoryTouchedManually,
  applyCategorySuggestion,
  setSuggestionDismissed,
  setCategorySuggestions,
  bilOgMcCategoryId,
}: WizardSharedProps) {
  return (
    <section className="space-y-3">
      <Label>
        Kategori
        <RequiredMark />
      </Label>

      {!native && categorySuggestions.length > 0 && !categoryTouchedManually && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <span>Foreslått: </span>
          {categorySuggestions.map((s) => (
            <Button
              key={s.category_id}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyCategorySuggestion(s.category_id)}
            >
              {s.parent_name_nb ? `${s.parent_name_nb} › ${s.name_nb}` : s.name_nb}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Lukk kategoriforslag"
            className="ml-auto"
            onClick={() => {
              setSuggestionDismissed(true);
              setCategorySuggestions([]);
            }}
          >
            ✕
          </Button>
        </div>
      )}

      <CategoryPicker
        inline
        open={false}
        onOpenChange={() => {}}
        categories={categories ?? []}
        selectedId={categoryId}
        onSelect={onCategorySelect}
        selectableGroups={bilOgMcCategoryId ? [bilOgMcCategoryId] : undefined}
      />

      {errors.category_id && (
        <p id="category-error" className="text-sm text-destructive">
          {errors.category_id.message}
        </p>
      )}
    </section>
  );
}
