import { useMemo, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";

import {
  AttributeFields,
  useAllCategoryFilters,
  type AttributeMap,
} from "@/components/attribute-fields";
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
  onCategorySelect,
  categoryId,
  categorySlug,
  categories,
  attributes,
  onAttributesChange,
  attributesTouched,
  vehicleAttributeHiddenKeys,
  behavior,
  boatFactsActive,
  photoCategorySuggestions,
  photoAttributesAvailable,
  photoAttributeSuggestionLoading,
  requestPhotoAttributeSuggestions,
}: WizardSharedProps) {
  const categoriesById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );
  // Bildeforslag først (brief § 3) — de vises kun sammen med tittelforslagene
  // via samme "Kaupet foreslår"-chip, ikke som en egen chip.
  const mergedSuggestions =
    photoCategorySuggestions.length > 0 ? photoCategorySuggestions : categorySuggestions;
  const topSuggestion =
    mergedSuggestions.length > 0 && !categoryTouchedManually ? mergedSuggestions[0] : null;
  const topSuggestionIsPhotoOnly =
    !!topSuggestion &&
    photoCategorySuggestions.some((s) => s.category_id === topSuggestion.category_id) &&
    !categorySuggestions.some((s) => s.category_id === topSuggestion.category_id);
  const suggestedPath = topSuggestion
    ? categoryBreadcrumb(topSuggestion.category_id, categoriesById)
    : null;

  const { data: allFilters } = useAllCategoryFilters();
  // Bare nøklene: feltene var tomme før forslaget (se filteret under), så
  // "Angre" kan trygt bare fjerne dem igjen i stedet for å måtte huske en
  // tidligere verdi.
  const [appliedAttributeSuggestionKeys, setAppliedAttributeSuggestionKeys] = useState<
    string[] | null
  >(null);

  async function suggestAttributesFromPhotos() {
    if (!categorySlug) return;
    const suggestions = await requestPhotoAttributeSuggestions(categorySlug);
    const emptySuggestions = suggestions.filter(
      (s) => attributes[s.key] === undefined || attributes[s.key] === "",
    );
    if (emptySuggestions.length === 0) return;
    const next: AttributeMap = { ...attributes };
    for (const s of emptySuggestions) next[s.key] = s.value;
    onAttributesChange(next);
    setAppliedAttributeSuggestionKeys(emptySuggestions.map((s) => s.key));
  }

  function undoAttributeSuggestions() {
    if (!appliedAttributeSuggestionKeys) return;
    const next: AttributeMap = { ...attributes };
    for (const key of appliedAttributeSuggestionKeys) delete next[key];
    onAttributesChange(next);
    setAppliedAttributeSuggestionKeys(null);
  }

  const filterLabelsByKey = useMemo(
    () => new Map((allFilters ?? []).map((f) => [f.key, f.label_nb])),
    [allFilters],
  );

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
          className="space-y-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 font-medium text-brand-text">
              <Sparkles className="size-4 shrink-0" aria-hidden />
              Kaupet foreslår
            </span>
            <span className="min-w-0">{suggestedPath}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="category-suggestion-accept"
              className="native-touch-target"
              onClick={() =>
                topSuggestionIsPhotoOnly
                  ? onCategorySelect(
                      topSuggestion.category_id,
                      topSuggestion.parent_id ?? topSuggestion.category_id,
                    )
                  : applyCategorySuggestion(topSuggestion.category_id)
              }
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
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCategoryPickerOpen(true)}
          aria-label={`Kategori${categoryLabel ? `, ${categoryLabel}` : ""}`}
          aria-haspopup="dialog"
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
          <span>{categoryLabel ?? "Velg kategori"}</span>
          {/* Åpner et eget vindu (Dialog/Sheet), ikke en nedtrekksliste — derfor
              ChevronRight/«Endre» og ikke ChevronDown. */}
          <span className="flex items-center gap-1 text-muted-foreground">
            {categoryLabel && <span className="text-primary">Endre</span>}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </button>
      )}

      {errors.category_id && (
        <p id="category-error" className="text-sm text-destructive">
          {errors.category_id.message}
        </p>
      )}

      {!boatFactsActive && categoryId && photoAttributesAvailable && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="photo-attribute-suggestion-button"
            className="native-touch-target h-auto gap-1.5 px-0 text-brand-text hover:bg-transparent hover:text-brand-text"
            onClick={suggestAttributesFromPhotos}
            disabled={photoAttributeSuggestionLoading}
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            {photoAttributeSuggestionLoading ? "Henter forslag …" : "Foreslå detaljer fra bildene"}
          </Button>
          {appliedAttributeSuggestionKeys && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
              <span className="text-brand-text">
                Kaupet fylte ut{" "}
                {appliedAttributeSuggestionKeys
                  .map((key) => filterLabelsByKey.get(key) ?? key)
                  .join(" og ")}{" "}
                fra bildene. Sjekk at det stemmer.
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="native-touch-target"
                onClick={undoAttributeSuggestions}
              >
                Angre
              </Button>
            </div>
          )}
        </div>
      )}

      {!boatFactsActive && (
        <AttributeFields
          categoryId={categoryId || topSuggestion?.category_id || null}
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
