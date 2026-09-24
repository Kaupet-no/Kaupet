import { useMemo } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

import { AttributeFields } from "@/components/attribute-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { categoryBreadcrumb } from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";

/**
 * Category picker + suggestion chip + generic category attributes. For
 * Bil og MC (`!behavior.showGenericAttributes`), category and Egenskaper
 * are already locked in via vehicle-registration/vehicle-confirm earlier
 * in the flow, so this group renders nothing — it stays in the flow (it's
 * a `LOCKED_FIELD_GROUP_KEYS` entry) but is a no-op page for vehicle
 * listings.
 *
 * The suggestion chip replaces the old separate category-confirm step for
 * non-vehicle/-boat categories (see suggestionNeedsCategoryConfirm in
 * category-flows.ts): the suggestion is a visible, actionable chip rather
 * than a silent overwrite — clicking it or the manual picker's "Endre" both
 * open the same CategoryPicker, and simply moving on from this page also
 * accepts the top suggestion (see ny-annonse.tsx's goToNextPage).
 */
export function CategoryAttributes({
  errors,
  touchedFields,
  categoryLabel,
  setCategoryPickerOpen,
  categorySuggestions,
  categoryTouchedManually,
  applyCategorySuggestion,
  categoryId,
  categories,
  attributes,
  onAttributesChange,
  attributesTouched,
  vehicleAttributeHiddenKeys,
  behavior,
  boatFactsActive,
}: WizardSharedProps) {
  const categoriesById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );
  const topSuggestion =
    categorySuggestions.length > 0 && !categoryTouchedManually ? categorySuggestions[0] : null;
  const suggestedPath = topSuggestion
    ? categoryBreadcrumb(topSuggestion.category_id, categoriesById)
    : null;

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

      {topSuggestion ? (
        <div
          data-testid="category-suggestion-chip"
          className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm"
        >
          <span className="inline-flex items-center gap-1 font-medium text-brand-text">
            <Sparkles className="size-4 shrink-0" aria-hidden />
            Kaupet foreslår
          </span>
          <span className="min-w-0 flex-1 truncate">{suggestedPath}</span>
          <Button
            type="button"
            size="sm"
            data-testid="category-suggestion-accept"
            className="native-touch-target"
            onClick={() => applyCategorySuggestion(topSuggestion.category_id)}
          >
            Riktig
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="native-touch-target"
            onClick={() => setCategoryPickerOpen(true)}
          >
            Endre
          </Button>
        </div>
      ) : (
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
      )}

      {errors.category_id && (
        <p id="category-error" className="text-sm text-destructive">
          {errors.category_id.message}
        </p>
      )}

      {!boatFactsActive && (
        <AttributeFields
          categoryId={categoryId || null}
          categories={categories ?? []}
          value={attributes}
          onChange={onAttributesChange}
          showErrors={attributesTouched}
          hiddenKeys={vehicleAttributeHiddenKeys}
          required={behavior.requiresCategoryFilterValues}
        />
      )}
    </section>
  );
}
