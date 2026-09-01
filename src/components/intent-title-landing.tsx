import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Gift,
  Search,
  ShieldCheck,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prefetchCategorySuggestion } from "@/lib/category-suggestion.functions";
import { cn } from "@/lib/utils";

type Intent = "sell" | "buy" | "free";

const INTENT_OPTIONS: { value: Intent; label: string; description: string; icon: LucideIcon }[] = [
  {
    value: "sell",
    label: "Jeg vil selge",
    description: "Sett en pris og finn en ny eier.",
    icon: ShoppingBag,
  },
  {
    value: "buy",
    label: "Jeg leter etter",
    description: "Etterlys akkurat det du ønsker å kjøpe.",
    icon: Search,
  },
  {
    value: "free",
    label: "Jeg vil gi bort",
    description: "La noen hente det du ikke trenger.",
    icon: Gift,
  },
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
      className="flex flex-col gap-6 pt-2 sm:gap-7 sm:pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <header className="space-y-2 text-left">
        <p className="text-xs font-semibold tracking-[0.1em] text-brand-text uppercase">
          Ny annonse
        </p>
        <h2 className="font-display text-4xl leading-[1.04] tracking-tight sm:text-5xl">
          Hva vil du gjøre?
        </h2>
      </header>

      <div role="radiogroup" aria-label="Jeg ønsker å" className="grid gap-3 sm:grid-cols-3">
        {INTENT_OPTIONS.map((opt) => {
          const selected = intent === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-label={opt.label}
              aria-checked={selected}
              onClick={() => {
                setIntent(opt.value);
                setError(null);
              }}
              className={cn(
                "native-touch-target group relative flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-32 sm:flex-col sm:items-stretch sm:justify-between sm:gap-0 sm:rounded-2xl sm:p-4",
                selected
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:shadow-sm",
              )}
            >
              <span className="flex shrink-0 items-start justify-between sm:w-full">
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl transition-colors duration-150",
                    selected ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border text-transparent transition-[background-color,border-color,color] duration-150",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                  aria-hidden="true"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold sm:mt-4 sm:text-base">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {opt.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 sm:grid-cols-[1.35fr_0.85fr] sm:items-end">
        <div className="w-full space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="listing-title" className="text-sm font-medium">
              Hva gjelder annonsen?
            </Label>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Du kan endre dette senere
            </span>
          </div>
          <Input
            id="listing-title"
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            placeholder="For eksempel: vintage lenestol i eik"
            className="h-14 rounded-xl px-4 text-base sm:text-lg"
            aria-invalid={!!error}
            aria-describedby={error ? "listing-title-error" : undefined}
          />
          {error && (
            <p id="listing-title-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="h-14 w-full gap-2 rounded-xl">
          Start annonsen
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <p className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        Annonsen lagres som utkast mens du jobber.
      </p>
    </form>
  );
}
