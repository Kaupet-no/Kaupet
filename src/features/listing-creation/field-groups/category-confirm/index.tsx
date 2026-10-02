import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/category-picker";
import { CATEGORY_SUGGESTION_LOADING_MESSAGE } from "@/features/listing-creation/use-category-suggestion-loading-message";

import type { WizardSharedProps } from "../types";

function suggestionLabel(s: { name_nb: string; parent_name_nb: string | null }): string {
  return s.parent_name_nb ? `${s.parent_name_nb} › ${s.name_nb}` : s.name_nb;
}

/** Dedicated category choice before category-specific fields. */
export function CategoryConfirm({
  categorySuggestions: titleSuggestions,
  photoCategorySuggestions = [],
  categorySuggestionLoading,
  applyCategorySuggestion,
  categories,
  categoryId,
  onCategorySelect,
  bilOgMcCategoryId,
}: WizardSharedProps) {
  const categorySuggestions = [
    ...new Map(
      [...photoCategorySuggestions, ...titleSuggestions].map((s) => [s.category_id, s]),
    ).values(),
  ];
  const [showPicker, setShowPicker] = useState(false);
  // Captured before applyCategorySuggestion clears categorySuggestions (it's
  // shared state also used to dismiss the category-select suggestion chip) —
  // without this, confirming would clear categorySuggestions and fall
  // straight back into the "no suggestion" branch below, i.e. flash the
  // manual picker for a tick before the wizard navigates away. Selecting a
  // category here removes this step from the wizard entirely (see
  // categoryConfirmed in ny-annonse.tsx), advancing automatically — this is
  // purely a one-render safety net for that transition, not a resting state.
  const [clickedName, setClickedName] = useState<string | null>(null);
  const confirmedName = clickedName;
  const loadingMessage = CATEGORY_SUGGESTION_LOADING_MESSAGE;

  if (
    !confirmedName &&
    (showPicker || (categorySuggestions.length === 0 && !categorySuggestionLoading))
  ) {
    return (
      <section className="space-y-3">
        <p className="text-lg font-semibold">
          {showPicker ? "Velg kategori" : "Vi fant ingen sikker kategori"}
        </p>
        <p className="text-sm text-muted-foreground">
          Velg kategorien som passer best for annonsen.
        </p>
        <CategoryPicker
          inline
          open={false}
          onOpenChange={() => {}}
          categories={categories ?? []}
          selectedId={categoryId}
          onSelect={onCategorySelect}
          selectableGroups={bilOgMcCategoryId ? [bilOgMcCategoryId] : undefined}
        />
      </section>
    );
  }

  if (!confirmedName && categorySuggestions.length === 0) {
    return (
      <section
        className="space-y-4 py-6 text-center"
        role="status"
        aria-live="polite"
        aria-busy={categorySuggestionLoading || undefined}
      >
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{loadingMessage}</p>
        <Button type="button" variant="outline" onClick={() => setShowPicker(true)}>
          Velg kategori selv
        </Button>
      </section>
    );
  }

  if (confirmedName) {
    return (
      <section className="space-y-2 py-4 text-center">
        <p className="text-lg font-semibold">
          Denne annonsen blir opprettet i kategori{" "}
          <span className="text-primary">{confirmedName}</span>.
        </p>
      </section>
    );
  }

  const question =
    categorySuggestions.length > 1
      ? "Velg kategorien som passer best for annonsen."
      : `Denne annonsen blir opprettet i kategori ${suggestionLabel(categorySuggestions[0])}. Er det riktig?`;

  return (
    <section className="space-y-4 py-4 text-center">
      <p className="text-lg font-semibold">{question}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {categorySuggestions.map((suggestion) => (
          <Button
            key={suggestion.category_id}
            type="button"
            onClick={() => {
              setClickedName(suggestionLabel(suggestion));
              if (photoCategorySuggestions.some((s) => s.category_id === suggestion.category_id)) {
                onCategorySelect(
                  suggestion.category_id,
                  suggestion.parent_id ?? suggestion.category_id,
                );
              } else {
                applyCategorySuggestion(suggestion.category_id);
              }
            }}
          >
            {categorySuggestions.length > 1 ? "Bruk" : "Ja, bruk"} «{suggestionLabel(suggestion)}»
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={() => setShowPicker(true)}>
          Velg en annen kategori
        </Button>
      </div>
    </section>
  );
}
