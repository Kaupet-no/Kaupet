import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/category-picker";
import { useCategorySuggestionLoadingMessage } from "@/features/listing-creation/use-category-suggestion-loading-message";

import type { WizardSharedProps } from "../types";

function suggestionLabel(s: { name_nb: string; parent_name_nb: string | null }): string {
  return s.parent_name_nb ? `${s.parent_name_nb} › ${s.name_nb}` : s.name_nb;
}

/** Categories the model most often gets confused between and Motorsport
 * (fast cars/bikes get suggested as one of these, but Motorsport is often
 * what the user actually meant) — see category-suggestion-ai.server.ts,
 * which keeps Motorsport out of the model's own candidate list entirely. */
const MOTORSPORT_CONFUSABLE_NAMES = new Set(["Bil", "Motorsykkel", "Moped", "ATV", "Snøscooter"]);

/**
 * Runtime-only step spliced into `fieldGroupKeys` right after `title-photos`
 * when the wizard was entered via the intent+title landing screen (see
 * ny-annonse.tsx) — replaces the forced category-select-as-step-1, since the
 * title already lets `suggestCategoryForTitle` guess a category. Mirrors the
 * vehicle-confirm precedent: never part of a category's stored field_groups
 * (see category-flows.ts), always solo (see SOLO_FIELD_GROUP_KEYS).
 *
 * `categorySuggestions` can hold up to 2 candidates (see
 * category-suggestion-ai.server.ts) — e.g. "Bil" vs. "MC" for an ambiguous
 * title — in which case both are offered as buttons rather than forcing
 * a single guess through the full manual picker.
 */
export function CategoryConfirm({
  categorySuggestions,
  categorySuggestionLoading,
  applyCategorySuggestion,
  categories,
  categoryId,
  onCategorySelect,
  bilOgMcCategoryId,
}: WizardSharedProps) {
  const motorsportCategory = categories?.find((c) => c.name_nb === "Motorsport");
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
  // Unlike applyCategorySuggestion (never gated — see applySuggestedCategory
  // in ny-annonse.tsx), onCategorySelect routes through requestCategorySelect,
  // which defers to a separate pending-change confirmation dialog instead of
  // applying immediately if `attributes` already has keys. That shouldn't
  // happen here in practice (category-confirm is the wizard's first step,
  // right after title-photos, before anything can populate attributes), but
  // rather than assume the click always applies synchronously, derive the
  // Motorsport confirmation from categoryId actually reflecting it instead of
  // setting it optimistically on click.
  const confirmedName =
    clickedName ??
    (motorsportCategory && categoryId === motorsportCategory.id ? "Motorsport" : null);
  const isWaitingForSuggestion =
    !confirmedName && !showPicker && categorySuggestionLoading && categorySuggestions.length === 0;
  const loadingMessage = useCategorySuggestionLoadingMessage(isWaitingForSuggestion);

  if (
    !confirmedName &&
    (showPicker || (categorySuggestions.length === 0 && !categorySuggestionLoading))
  ) {
    return (
      <section className="space-y-3">
        <p className="text-lg font-semibold">Velg kategori</p>
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

  if (!confirmedName && (categorySuggestionLoading || categorySuggestions.length === 0)) {
    return (
      <section className="space-y-4 py-6 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{loadingMessage}</p>
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

  const names = categorySuggestions.map(suggestionLabel);
  const question =
    categorySuggestions.length > 1
      ? `Er denne annonsen i kategori ${names.join(" eller ")}?`
      : `Denne annonsen blir opprettet i kategori ${names[0]}. Er det riktig?`;
  const showMotorsportButton =
    motorsportCategory &&
    categorySuggestions.some((s) => MOTORSPORT_CONFUSABLE_NAMES.has(s.name_nb));

  return (
    <section className="space-y-4 py-4 text-center">
      <p className="text-lg font-semibold">{question}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {categorySuggestions.map((suggestion, i) => (
          <Button
            key={suggestion.category_id}
            type="button"
            onClick={() => {
              setClickedName(names[i]);
              applyCategorySuggestion(suggestion.category_id);
            }}
          >
            {names[i]}
          </Button>
        ))}
        {showMotorsportButton && motorsportCategory && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onCategorySelect(motorsportCategory.id, motorsportCategory.parent_id ?? "")
            }
          >
            Benytt kategori Motorsport
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => setShowPicker(true)}>
          Nei
        </Button>
      </div>
    </section>
  );
}
