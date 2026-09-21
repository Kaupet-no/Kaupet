import { Check, ChevronDown } from "lucide-react";

import { type WizardPage } from "@/features/listing-creation/use-listing-steps";
import { pageLabel } from "@/features/listing-creation/field-groups/registry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";

export function ComposerStepIndicator({
  current,
  total,
  label,
  stepLabels,
  onSelectStep,
}: {
  current: number;
  total: number;
  label: string;
  /** Etikett per steg, indeks 0 = steg 1. Sammen med `onSelectStep` gjør den telleren til en meny. */
  stepLabels?: string[];
  onSelectStep?: (step: number) => void;
}) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const counter = `Steg ${current} av ${total}`;
  const navigable = stepLabels && onSelectStep;

  return (
    <nav aria-label="Fremdrift i skjema" className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        {navigable ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="native-touch-target -my-1 -ml-1 flex items-center gap-1 rounded-md px-1 py-1 font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {counter}
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {stepLabels.map((stepLabel, index) => {
                const stepNumber = index + 1;
                const isCurrent = stepNumber === current;
                return (
                  <DropdownMenuItem
                    key={`${stepNumber}-${stepLabel}`}
                    disabled={stepNumber > current}
                    aria-current={isCurrent ? "step" : undefined}
                    onSelect={() => onSelectStep(stepNumber)}
                  >
                    <Check className={isCurrent ? "size-4" : "size-4 opacity-0"} aria-hidden />
                    {stepNumber}. {stepLabel}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="font-medium text-foreground">{counter}</span>
        )}
        <span className="truncate text-muted-foreground">{label}</span>
      </div>
      <Progress value={percent} aria-label={`${counter}: ${label}`} className="h-1.5 bg-muted" />
    </nav>
  );
}

/**
 * Fast fremdriftslinje + "Steg X av Y" i stedet for én boks per steg — med
 * så mange steg som kjøretøyflyten nå har (se UX-audit), gikk
 * boks-per-steg-varianten over tilgjengelig sidebredde og virket enda
 * verre på små skjermer. Viser alltid gjeldende stegs label ved siden av
 * telleren, så brukeren fortsatt vet hvor i flyten de er uten å måtte lese
 * en rekke med bokser. Telleren er en meny tilbake til tidligere steg —
 * den erstatter navigasjonen "Se over"-seksjonen tidligere ga. Kun bakover:
 * steg foran gjeldende er deaktivert, så fremovervalideringen i
 * attemptNextPage ikke kan omgås.
 */
export function StepIndicator({
  step,
  pages,
  onSelectStep,
}: {
  step: number;
  pages: WizardPage[];
  onSelectStep?: (step: number) => void;
}) {
  const displaySteps = pages.map((page, index) => ({
    label: pageLabel(page.groups),
    startIndex: index + 1,
    endIndex: index + 1,
  }));
  const total = displaySteps.length;
  const currentIndex = displaySteps.findIndex((ds) => step >= ds.startIndex && step <= ds.endIndex);
  const current = currentIndex === -1 ? displaySteps[total - 1] : displaySteps[currentIndex];
  const currentStepNumber = currentIndex === -1 ? total : currentIndex + 1;
  return (
    <ComposerStepIndicator
      current={currentStepNumber}
      total={total}
      label={current?.label ?? ""}
      stepLabels={onSelectStep ? displaySteps.map((ds) => ds.label) : undefined}
      onSelectStep={onSelectStep}
    />
  );
}
