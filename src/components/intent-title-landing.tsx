import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { prefetchCategorySuggestion } from "@/lib/category-suggestion.functions";

type Intent = "sell" | "buy" | "free";

const INTENT_LABELS: Record<Intent, string> = {
  sell: "selge",
  buy: "kjøpe",
  free: "gi bort",
};

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
      className="flex flex-col items-center gap-6 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xl font-semibold">
        <span>Jeg ønsker å</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              {INTENT_LABELS[intent]}
              <ChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          {/* z-[10000] Dialog/Sheet-innhold (se ui/dialog.tsx, ui/sheet.tsx) er
          høyere enn DropdownMenuContents standard z-50 — uten override åpner
          menyen usynlig bak modalen når landingsbildet vises i
          ResponsiveOverlay. */}
          <DropdownMenuContent align="center" className="z-[10001]">
            {(Object.keys(INTENT_LABELS) as Intent[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onSelect={() => {
                  setIntent(key);
                  setError(null);
                }}
              >
                {INTENT_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span>:</span>
      </div>
      <div className="w-full space-y-1.5">
        <Input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Navn eller beskrivelse av objektet"
          className="h-12 text-center text-lg"
          aria-label="Tittel på annonsen"
          aria-invalid={!!error}
        />
        {error && <p className="text-center text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <span>Dette blir tittelen på annonsen din</span>
          <button
            type="button"
            className="native-touch-target inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Informasjon om automatisk tittel"
            title="For Bil, MC og Båt genereres tittelen automatisk"
          >
            <Info className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full">
        Fortsett
      </Button>
    </form>
  );
}
