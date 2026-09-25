import { useNavigate } from "@tanstack/react-router";
import { Gift, Search, ShoppingBag, type LucideIcon } from "lucide-react";

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

/**
 * Første valg når en annonse opprettes: bare hva slags annonse. Et trykk
 * starter veiviseren direkte — salg og gi bort begynner med bilder (se
 * applyPhotosEntry i category-flows.ts), etterlysninger med vanlig flyt.
 */
export function IntentTitleLanding({
  onNavigate,
  defaultIntent,
}: {
  onNavigate?: () => void;
  /** Fremhever valget brukeren kom fra (f.eks. «Ny etterlysning»). */
  defaultIntent?: Intent;
}) {
  return (
    <div className="flex flex-col gap-6 pt-2 sm:gap-7 sm:pt-0">
      <header className="text-left">
        <h2 className="font-display text-4xl leading-[1.04] tracking-tight sm:text-5xl">
          Hva vil du opprette?
        </h2>
      </header>
      <IntentOptions onNavigate={onNavigate} defaultIntent={defaultIntent} />
    </div>
  );
}

/** De tre valgkortene alene — brukt i dialogen over og inline under
 * «Opprett en annonse» på forsiden (animert av HeroReveal i index.tsx). */
export function IntentOptions({
  onNavigate,
  defaultIntent,
}: {
  onNavigate?: () => void;
  defaultIntent?: Intent;
}) {
  const navigate = useNavigate();

  function start(intent: Intent) {
    if (intent === "buy") {
      void navigate({ to: "/ny-ok-annonse" });
    } else {
      void navigate({ to: "/ny-annonse", search: { type: intent, start: "bilder" } });
    }
    onNavigate?.();
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {INTENT_OPTIONS.map((opt) => {
        const highlighted = defaultIntent === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => start(opt.value)}
            className={cn(
              "native-touch-target group flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/50 hover:bg-muted hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-32 sm:flex-col sm:items-stretch sm:justify-between sm:gap-0 sm:rounded-2xl sm:p-4",
              highlighted ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card",
            )}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold sm:mt-4 sm:text-base">{opt.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                {opt.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
