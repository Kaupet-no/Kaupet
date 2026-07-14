import { Label } from "@/components/ui/label";
import { CONDITIONS } from "@/lib/constants";

import type { WizardSharedProps, ListingFormShape } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * Tilstand (condition). Web renders a grid of description-cards; native
 * renders a horizontal scrollable chip row plus a single description line
 * below — two genuinely different layouts preserved verbatim per platform.
 */
export function Condition({
  native,
  setValue,
  condition,
  conditionDescription,
}: Pick<WizardSharedProps, "native" | "setValue" | "condition" | "conditionDescription">) {
  if (native) {
    return (
      <section className="space-y-2">
        <Label>
          Tilstand
          <RequiredMark />
        </Label>
        <div
          role="radiogroup"
          aria-label="Tilstand"
          className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4"
        >
          {CONDITIONS.map((c) => (
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
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                condition === c.value
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {conditionDescription && (
          <p className="text-xs text-muted-foreground">{conditionDescription}</p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <Label>Tilstand</Label>
      <div
        role="radiogroup"
        aria-label="Tilstand"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {CONDITIONS.map((c) => (
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
            className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
              condition === c.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            <span className="text-sm font-medium">{c.label}</span>
            <span className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {c.description}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
