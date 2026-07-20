import { Label } from "@/components/ui/label";
import { CONDITIONS, VEHICLE_CONDITIONS } from "@/lib/constants";

import type { WizardSharedProps, ListingFormShape } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * Tilstand (condition): a single vertical list of full-width radio-cards,
 * same layout on web and native, each showing the label and its *complete*
 * description (no truncation) — the previous grid-of-cards (web, 2-line
 * clamp) and horizontal-chip-row-plus-single-description-line (native) both
 * cut off text once the vehicle grades got longer, two-sentence
 * descriptions. A vertical list scales to arbitrary description length on
 * both platforms without a platform-specific layout.
 *
 * For Bil og MC (`isVehicle`), the vehicle-appropriate grades (Utmerket/
 * Normal bruksslitasje/Godt brukt/Reparasjonsobjekt) are shown, reusing the
 * same enum values.
 */
export function Condition({
  setValue,
  condition,
  isVehicle,
}: Pick<WizardSharedProps, "setValue" | "condition" | "isVehicle">) {
  const options = isVehicle ? VEHICLE_CONDITIONS : CONDITIONS;

  return (
    <section className="space-y-2">
      <Label>
        Tilstand
        <RequiredMark />
      </Label>
      <div role="radiogroup" aria-label="Tilstand" className="space-y-2">
        {options.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={condition === c.value}
            onClick={() =>
              setValue("condition", c.value as ListingFormShape["condition"], {
                shouldValidate: true,
              })
            }
            className={`flex w-full flex-col items-start rounded-xl border px-3.5 py-3 text-left transition-colors ${
              condition === c.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            <span className="text-sm font-medium">{c.label}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">{c.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
