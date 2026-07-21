import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONDITIONS, VEHICLE_CONDITIONS } from "@/lib/constants";

import type { WizardSharedProps, ListingFormShape } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * Tilstand (condition): a dropdown rather than the previous vertical list of
 * radio-cards, to keep the (long, Beskrivelse-steget) page more compact.
 * Each option's full description is still shown — both inside the open
 * dropdown (under each label) and, once a value is picked, as helper text
 * under the closed trigger — so collapsing the list into a `<Select>` loses
 * none of the descriptive text the radio-cards used to show.
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
        <SelectTrigger id="condition-select" aria-label="Tilstand">
          <SelectValue placeholder="Velg tilstand">{selected?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              <span className="flex flex-col items-start py-0.5 pr-2">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground group-focus:text-accent-foreground/80">
                  {c.description}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && <p className="text-xs text-muted-foreground">{selected.description}</p>}
    </section>
  );
}
