import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryPicker } from "@/components/category-picker";

import type { WizardSharedProps } from "../types";

function suggestionLabel(s: { name_nb: string; parent_name_nb: string | null }): string {
  return s.parent_name_nb ? `${s.parent_name_nb} › ${s.name_nb}` : s.name_nb;
}

/**
 * Runtime-only step spliced into `fieldGroupKeys` right after `title-photos`
 * when the wizard was entered via the intent+title landing screen (see
 * ny-annonse.tsx) — replaces the forced category-select-as-step-1, since the
 * title already lets `suggestCategoryForTitle` guess a category. Mirrors the
 * vehicle-confirm precedent: never part of a category's stored field_groups
 * (see category-flows.ts), always solo (see SOLO_FIELD_GROUP_KEYS).
 *
 * `categorySuggestions` can hold up to 2 candidates (see
 * category-suggestion-ai.server.ts) — e.g. "Bil" vs. "Bilsport" for a sports
 * car title — in which case both are offered as buttons rather than forcing
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
  const [showPicker, setShowPicker] = useState(false);
  // Captured before applyCategorySuggestion clears categorySuggestions (it's
  // shared state also used to dismiss the category-select suggestion chip) —
  // without this, confirming would clear categorySuggestions and fall
  // straight back into the "no suggestion" branch below, i.e. dump the user
  // on the manual picker right after they confirmed. Once set, this step is
  // done; the wizard's own "Neste" button (unaffected by this field group)
  // takes the user forward.
  const [confirmedName, setConfirmedName] = useState<string | null>(null);

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
        <Skeleton className="mx-auto h-6 w-2/3" />
        <p className="text-sm text-muted-foreground">Gi oss et lite øyeblikk…</p>
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
        <p className="text-sm text-muted-foreground">Trykk «Neste» for å fortsette.</p>
      </section>
    );
  }

  const names = categorySuggestions.map(suggestionLabel);
  const question =
    categorySuggestions.length > 1
      ? `Er denne annonsen i kategori ${names.join(" eller ")}?`
      : `Denne annonsen blir opprettet i kategori ${names[0]}. Er det riktig?`;

  return (
    <section className="space-y-4 py-4 text-center">
      <p className="text-lg font-semibold">{question}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {categorySuggestions.map((suggestion, i) => (
          <Button
            key={suggestion.category_id}
            type="button"
            onClick={() => {
              setConfirmedName(names[i]);
              applyCategorySuggestion(suggestion.category_id);
            }}
          >
            {names[i]}
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={() => setShowPicker(true)}>
          Nei
        </Button>
      </div>
    </section>
  );
}
