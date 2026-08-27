import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONDITIONS, VEHICLE_CONDITIONS_BY_SLUG } from "@/lib/constants";
import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

import type { WizardSharedProps, ListingFormShape } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * Tilstand (condition): a dropdown rather than the previous vertical list of
 * radio-cards, to keep the (long, Beskrivelse-steget) page more compact.
 * Each option's full description is still shown for non-vehicle categories —
 * both inside the open dropdown (under each label) and, once a value is
 * picked, as helper text under the closed trigger — so collapsing the list
 * into a `<Select>` loses none of the descriptive text the radio-cards used
 * to show.
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
  const selected = options.find((c) => c.value === condition);

  return (
    <section className="space-y-2">
      <Label htmlFor="condition-select">
        Tilstand
        <RequiredMark />
      </Label>
      <Select
        value={condition ?? undefined}
        onValueChange={(v) =>
          setValue("condition", v as ListingFormShape["condition"], { shouldValidate: true })
        }
      >
        <SelectTrigger id="condition-select" aria-label="Tilstand" aria-required="true">
          <SelectValue placeholder="Velg tilstand">{selected?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              <span className="flex flex-col items-start py-0.5 pr-2">
                <span className="text-sm font-medium">{c.label}</span>
                {"description" in c && (
                  <span className="text-xs text-muted-foreground group-focus:text-accent-foreground/80">
                    {c.description}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && "description" in selected && (
        <p className="text-xs text-muted-foreground">{selected.description}</p>
      )}
    </section>
  );
}
