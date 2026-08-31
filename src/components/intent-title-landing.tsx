import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { prefetchCategorySuggestion } from "@/lib/category-suggestion.functions";

type Intent = "sell" | "buy" | "free";

const INTENT_OPTIONS: { value: Intent; label: string }[] = [
  { value: "sell", label: "Selge" },
  { value: "buy", label: "Ønskes kjøpt" },
  { value: "free", label: "Gi bort" },
];

/** Matches wtbSchema's title min (3) for "kjøpe", listingSchema's (5) for
 * "selge"/"gi bort" — a title shorter than this never triggers the
 * suggestCategoryForTitle fetch (see use-listing-title-hints.ts), so letting
 * it through here would silently skip straight to the manual category
 * picker with no suggestion ever attempted. */
function minTitleLength(intent: Intent): number {
  return intent === "buy" ? 3 : 5;
}

export function IntentTitleLanding({
  onNavigate,
  defaultIntent = "sell",
}: {
  onNavigate?: () => void;
  defaultIntent?: Intent;
}) {
  const navigate = useNavigate();
  const [intent, setIntent] = useState<Intent>(defaultIntent);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmed = title.trim();
    if (trimmed.length < minTitleLength(intent)) {
      setError(`Tittelen må være minst ${minTitleLength(intent)} tegn`);
      return;
    }
    // Starts the category call before the wizard mounts so the result is ready
    // when the user reaches the confirmation step.
    prefetchCategorySuggestion(trimmed);
    if (intent === "buy") {
      void navigate({ to: "/ny-ok-annonse", search: { title: trimmed } });
    } else {
      void navigate({ to: "/ny-annonse", search: { type: intent, title: trimmed } });
    }
    onNavigate?.();
  }

  return (
    <form
      className="flex flex-col items-stretch gap-6 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="w-full space-y-2">
        <Label id="intent-label" className="block text-center text-sm font-medium">
          Jeg ønsker å
        </Label>
        <div role="radiogroup" aria-labelledby="intent-label" className="flex flex-col gap-2">
          {INTENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={intent === opt.value}
              onClick={() => {
                setIntent(opt.value);
                setError(null);
              }}
              className={`native-touch-target flex min-h-14 w-full items-center justify-center rounded-xl border px-4 text-center text-base font-medium transition-colors ${
                intent === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full space-y-1.5">
        <Label htmlFor="listing-title" className="block text-left text-sm font-medium">
          Tittel på annonsen
        </Label>
        <Input
          id="listing-title"
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Navn eller beskrivelse av objektet"
          className="h-12 text-center text-lg"
          aria-invalid={!!error}
        />
        {error && <p className="text-center text-xs text-destructive">{error}</p>}
      </div>
      <Button type="submit" size="lg" className="w-full">
        Fortsett
      </Button>
    </form>
  );
}
