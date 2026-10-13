import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";

import {
  AttributeFields,
  useAllCategoryFilters,
  type AttributeMap,
} from "@/components/attribute-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { effectiveFiltersForCategory } from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";

/** Confirmed category and its generic attributes. */
export function CategoryAttributes({
  errors,
  touchedFields,
  categoryLabel,
  setCategoryPickerOpen,
  categoryId,
  categorySlug,
  categories,
  attributes,
  onAttributesChange,
  attributesTouched,
  vehicleAttributeHiddenKeys,
  behavior,
  boatFactsActive,
  photoAttributesAvailable,
  photoAttributeSuggestionLoading,
  requestPhotoAttributeSuggestions,
}: WizardSharedProps) {
  const { data: allFilters } = useAllCategoryFilters();
  // Verdiene som ble foreslått. «Angre» fjerner bare felt som fortsatt har
  // den foreslåtte verdien, så senere manuelle endringer beholdes (KG-19-F01).
  const [appliedAttributeSuggestions, setAppliedAttributeSuggestions] =
    useState<AttributeMap | null>(null);
  // Forslaget kommer etter en await: det må bygge på verdiene brukeren har
  // nå, ikke øyeblikksbildet fra da knappen ble trykket.
  const latestAttributes = useRef(attributes);
  useEffect(() => {
    latestAttributes.current = attributes;
  }, [attributes]);

  async function suggestAttributesFromPhotos() {
    if (!categorySlug) return;
    const suggestions = await requestPhotoAttributeSuggestions(categorySlug);
    const current = latestAttributes.current;
    const emptySuggestions = suggestions.filter(
      (s) => current[s.key] === undefined || current[s.key] === "",
    );
    if (emptySuggestions.length === 0) return;
    const next: AttributeMap = { ...current };
    for (const s of emptySuggestions) next[s.key] = s.value;
    onAttributesChange(next);
    setAppliedAttributeSuggestions(
      Object.fromEntries(emptySuggestions.map((s) => [s.key, s.value])),
    );
  }

  function undoAttributeSuggestions() {
    if (!appliedAttributeSuggestions) return;
    const next: AttributeMap = { ...attributes };
    for (const [key, value] of Object.entries(appliedAttributeSuggestions)) {
      if (next[key] === value) delete next[key];
    }
    onAttributesChange(next);
    setAppliedAttributeSuggestions(null);
  }

  const filterLabelsByKey = useMemo(
    () =>
      new Map(
        effectiveFiltersForCategory(
          categoryId || null,
          allFilters ?? [],
          new Map((categories ?? []).map((category) => [category.id, category])),
        ).map((filter) => [filter.key, filter.label_nb]),
      ),
    [categoryId, categories, allFilters],
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
          {appliedAttributeSuggestions && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
              <span className="text-brand-text">
                Kaupet fylte ut{" "}
                {Object.keys(appliedAttributeSuggestions)
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
