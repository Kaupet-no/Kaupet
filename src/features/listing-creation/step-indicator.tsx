import { type WizardPage } from "@/features/listing-creation/use-listing-steps";
import { pageLabel } from "@/features/listing-creation/field-groups/registry";

/** A page (1-based index into `pages`) whose only group is `vehicle-confirm`
 * doesn't get its own dot in the step indicator — it's the same logical
 * "Registreringsnummer" step as the vehicle-registration page right before
 * it (SVV lookup + confirmation are one user-facing step, even though
 * they're two separate wizard pages internally). */
type DisplayStep = { label: string; startIndex: number; endIndex: number };

function buildDisplaySteps(pages: WizardPage[], native: boolean): DisplayStep[] {
  const steps: DisplayStep[] = [];
  pages.forEach((p, i) => {
    const index = i + 1;
    const isVehicleConfirmPage = p.groups.length === 1 && p.groups[0].key === "vehicle-confirm";
    const prev = steps[steps.length - 1];
    if (isVehicleConfirmPage && prev) {
      prev.endIndex = index;
      return;
    }
    steps.push({ label: pageLabel(p.groups, native), startIndex: index, endIndex: index });
  });
  return steps;
}

/**
 * Fast fremdriftslinje + "Steg X av Y" i stedet for én boks per steg — med
 * så mange steg som kjøretøyflyten nå har (se UX-audit), gikk
 * boks-per-steg-varianten over tilgjengelig sidebredde og virket enda
 * verre på små skjermer. Viser alltid gjeldende stegs label ved siden av
 * telleren, så brukeren fortsatt vet hvor i flyten de er uten å måtte lese
 * en rekke med bokser.
 */
export function StepIndicator({
  step,
  pages,
  native,
}: {
  step: number;
  pages: WizardPage[];
  native: boolean;
}) {
  const displaySteps = buildDisplaySteps(pages, native);
  const total = displaySteps.length;
  const currentIndex = displaySteps.findIndex((ds) => step >= ds.startIndex && step <= ds.endIndex);
  const current = currentIndex === -1 ? displaySteps[total - 1] : displaySteps[currentIndex];
  const currentStepNumber = currentIndex === -1 ? total : currentIndex + 1;
  const percent = total > 0 ? Math.round((currentStepNumber / total) * 100) : 0;

  return (
    <nav aria-label="Fremdrift i skjema" className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          Steg {currentStepNumber} av {total}
        </span>
        <span className="truncate text-muted-foreground">{current?.label}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={currentStepNumber}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Steg ${currentStepNumber} av ${total}: ${current?.label ?? ""}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </nav>
  );
}
