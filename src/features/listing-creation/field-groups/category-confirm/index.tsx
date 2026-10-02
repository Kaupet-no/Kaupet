import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/category-picker";
import { CATEGORY_SUGGESTION_LOADING_MESSAGE } from "@/features/listing-creation/use-category-suggestion-loading-message";

import type { WizardSharedProps } from "../types";

function suggestionLabel(s: { name_nb: string; parent_name_nb: string | null }): string {
  return s.parent_name_nb ? `${s.parent_name_nb} › ${s.name_nb}` : s.name_nb;
}

/** Om `id` ligger under `rootId` i kategoritreet (via `parent_id`). */
function isUnder(
  id: string,
  rootId: string,
  categoriesById: Map<string, { id: string; parent_id: string | null }>,
): boolean {
  for (let cur = categoriesById.get(id); cur;) {
    if (cur.id === rootId) return true;
    cur = cur.parent_id ? categoriesById.get(cur.parent_id) : undefined;
  }
  return false;
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
  // KI-en skiller ikke pålitelig mellom underkategoriene i Bil og MC (Bil,
  // Motorsykkel, ...), så her bekreftes bare «Bil og MC». Underkategorien
  // avgjøres på vehicle-registration: av SVV-oppslaget, eller av brukeren
  // når registreringsnummer ikke oppgis. Det første forslaget under Bil og MC
  // brukes som forhåndsvalg der.
  const categoriesById = new Map((categories ?? []).map((c) => [c.id, c]));
  const bilOgMcName = bilOgMcCategoryId
    ? categoriesById.get(bilOgMcCategoryId)?.name_nb
    : undefined;
  const options = new Map<
    string,
    { suggestion: (typeof titleSuggestions)[number]; label: string }
  >();
  for (const s of [...photoCategorySuggestions, ...titleSuggestions]) {
    const vehicle =
      !!bilOgMcCategoryId &&
      !!bilOgMcName &&
      isUnder(s.category_id, bilOgMcCategoryId, categoriesById);
    const key = vehicle ? bilOgMcCategoryId : s.category_id;
    if (!options.has(key)) {
      options.set(key, { suggestion: s, label: vehicle ? bilOgMcName : suggestionLabel(s) });
    }
  }
  const categorySuggestions = [...options.values()];
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

  // Vent til forslagene har landet: ellers kan knappene bytte plass idet
  // tittelforslaget kommer etter bildeforslaget.
  if (!confirmedName && (categorySuggestionLoading || categorySuggestions.length === 0)) {
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
      : `Denne annonsen blir opprettet i kategori ${categorySuggestions[0].label}. Er det riktig?`;

  return (
    <section className="space-y-4 py-4 text-center">
      <p className="text-lg font-semibold">{question}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {categorySuggestions.map(({ suggestion, label }) => (
          <Button
            key={suggestion.category_id}
            type="button"
            onClick={() => {
              setClickedName(label);
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
            {categorySuggestions.length > 1 ? "Bruk" : "Ja, bruk"} «{label}»
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={() => setShowPicker(true)}>
          Velg en annen kategori
        </Button>
      </div>
    </section>
  );
}
