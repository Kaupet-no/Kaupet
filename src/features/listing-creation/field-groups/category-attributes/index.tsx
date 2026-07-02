import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";

/** Category picker + suggestion banner + activeModules (vehicle-lookup/generic-attributes). */
export function CategoryAttributes({
  errors,
  touchedFields,
  categoryLabel,
  setCategoryPickerOpen,
  categorySuggestion,
  categoryTouchedManually,
  applyCategorySuggestion,
  setSuggestionDismissed,
  setCategorySuggestion,
  activeModules,
  categoryId,
  categories,
  attributes,
  onAttributesChange,
  attributesTouched,
}: WizardSharedProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label>Kategori</Label>
        <FieldValid show={!!touchedFields.category_id && !errors.category_id} />
      </div>

      {categorySuggestion && !categoryTouchedManually && (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
          <span>
            Forslag:{" "}
            {categorySuggestion.parent_name_nb
              ? `${categorySuggestion.parent_name_nb} › ${categorySuggestion.name_nb}`
              : categorySuggestion.name_nb}{" "}
            — bruk denne?
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={applyCategorySuggestion}>
            Bruk
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSuggestionDismissed(true);
              setCategorySuggestion(null);
            }}
          >
            ✕
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setCategoryPickerOpen(true)}
        aria-invalid={!!errors.category_id}
        aria-describedby={errors.category_id ? "category-error" : undefined}
        className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
          errors.category_id
            ? "border-destructive"
            : categoryLabel
              ? "border-border bg-card"
              : "border-border bg-card text-muted-foreground"
        } hover:border-primary/40`}
      >
        <span>{categoryLabel ?? "Velg kategori..."}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {errors.category_id && (
        <p id="category-error" className="text-sm text-destructive">
          {errors.category_id.message}
        </p>
      )}

      {activeModules.map(({ key, Component }) => (
        <Component
          key={key}
          categoryId={categoryId || null}
          categories={categories ?? []}
          value={attributes}
          onChange={onAttributesChange}
          showErrors={attributesTouched}
        />
      ))}
    </section>
  );
}
