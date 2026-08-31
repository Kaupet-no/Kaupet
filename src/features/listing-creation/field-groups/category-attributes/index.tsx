import { ChevronDown, Sparkles } from "lucide-react";

import { AttributeFields } from "@/components/attribute-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";

/**
 * Category picker + suggestion banner + generic category attributes. For
 * Bil og MC (`!behavior.showGenericAttributes`), category and Egenskaper
 * are already locked in via vehicle-registration/vehicle-confirm earlier
 * in the flow, so this group renders nothing — it stays in the flow (it's
 * a `LOCKED_FIELD_GROUP_KEYS` entry) but is a no-op page for vehicle
 * listings.
 */
export function CategoryAttributes({
  errors,
  touchedFields,
  categoryLabel,
  setCategoryPickerOpen,
  categorySuggestions,
  categoryTouchedManually,
  applyCategorySuggestion,
  setSuggestionDismissed,
  setCategorySuggestions,
  genericAttributesActive,
  categoryId,
  categories,
  attributes,
  onAttributesChange,
  attributesTouched,
  vehicleAttributeHiddenKeys,
  behavior,
  boatFactsActive,
}: WizardSharedProps) {
  if (!behavior.showGenericAttributes) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label id="category-attributes-label">
          Kategori
          <RequiredMark />
        </Label>
        <FieldValid show={!!touchedFields.category_id && !errors.category_id} />
      </div>

      {categorySuggestions.length > 0 && !categoryTouchedManually && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <span>Foreslått: </span>
          {categorySuggestions.map((s) => (
            <Button
              key={s.category_id}
              type="button"
              size="sm"
              variant="outline"
              className="native-touch-target"
              onClick={() => applyCategorySuggestion(s.category_id)}
            >
              {s.parent_name_nb ? `${s.parent_name_nb} › ${s.name_nb}` : s.name_nb}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="native-touch-target ml-auto"
            aria-label="Lukk kategoriforslag"
            onClick={() => {
              setSuggestionDismissed(true);
              setCategorySuggestions([]);
            }}
          >
            ✕
          </Button>
        </div>
      )}

      {categorySuggestions.length > 0 && !categoryTouchedManually && (
        <p className="text-xs text-muted-foreground">Eller velg en annen kategori selv:</p>
      )}

      <button
        type="button"
        onClick={() => setCategoryPickerOpen(true)}
        aria-label={`Kategori${categoryLabel ? `, ${categoryLabel}` : ""}`}
        aria-required="true"
        aria-invalid={!!errors.category_id}
        aria-describedby={errors.category_id ? "category-error" : undefined}
        className={`native-touch-target flex min-h-12 w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
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

      {!boatFactsActive && genericAttributesActive && (
        <AttributeFields
          categoryId={categoryId || null}
          categories={categories ?? []}
          value={attributes}
          onChange={onAttributesChange}
          showErrors={attributesTouched}
          hiddenKeys={vehicleAttributeHiddenKeys}
          required
        />
      )}
    </section>
  );
}
