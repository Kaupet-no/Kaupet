import { Label } from "@/components/ui/label";
import { CONDITIONS, VEHICLE_CONDITIONS_BY_SLUG } from "@/lib/constants";
import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

import type { WizardSharedProps, ListingFormShape } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * Tilstand (condition): a vertical list of choice-rows (whole row clickable,
 * radio indicator, hairline dividers — no card-in-card) rather than a
 * dropdown. Each option's full description is shown inline for non-vehicle
 * categories.
 *
 * For Bil og MC (`isVehicle`), the options are per-vehicle-type (e.g.
 * "Ny bil"/"Bruktbil"/"Utbedringer må påregnes"/"Reparasjonsobjekt/delebil"
 * for `bil`, "Ny MC"/"Brukt MC"/... for `motorsykkel`) but reuse the exact
 * same `condition` enum values as the generic options — so a "Tilstand"
 * search on the homepage matches both ordinary and vehicle listings. No
 * description text for these (self-explanatory labels, unlike the generic
 * ones).
 */
export function Condition({
  setValue,
  condition,
  isVehicle,
  categoryId,
  categories,
}: Pick<WizardSharedProps, "setValue" | "condition" | "isVehicle" | "categoryId" | "categories">) {
  const leafSlug = categories.find((c) => c.id === categoryId)?.slug as VehicleLeafSlug | undefined;
  const options = isVehicle
    ? (VEHICLE_CONDITIONS_BY_SLUG[leafSlug as VehicleLeafSlug] ?? VEHICLE_CONDITIONS_BY_SLUG.bil)
    : CONDITIONS;

  return (
    <section className="space-y-2">
      <Label id="condition-label">
        Tilstand
        <RequiredMark />
      </Label>
      <div
        role="radiogroup"
        aria-labelledby="condition-label"
        aria-required="true"
        className="divide-y divide-border rounded-md border border-border"
      >
        {options.map((c) => {
          const isSelected = condition === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() =>
                setValue("condition", c.value as ListingFormShape["condition"], {
                  shouldValidate: true,
                })
              }
              className="native-touch-target flex min-h-14 w-full items-start gap-3 px-3 py-3 text-left first:rounded-t-md last:rounded-b-md hover:bg-muted/50"
            >
              <span
                aria-hidden
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  isSelected ? "border-primary" : "border-border"
                }`}
              >
                {isSelected && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{c.label}</span>
                {"description" in c && (
                  <span className="text-xs text-muted-foreground">{c.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
