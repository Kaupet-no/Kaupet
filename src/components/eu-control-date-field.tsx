import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";

/** Fire år frem er så langt en EU-kontrollfrist realistisk kan ligge. */
const MAX_YEARS_AHEAD = 4;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Datofelt for EU-kontroll (og andre datoattributter, se
 * `DATE_ATTRIBUTE_KEYS`). `<input type="date">` snakker allerede ISO
 * (`yyyy-MM-dd`) — samme format som SVV leverer og som vi lagrer — og gir
 * brukeren plattformens egen datovelger, som er den native appen vil ha.
 * Brukeren kan ikke skrive fritekst, så et ugyldig format kan ikke oppstå.
 * `min`/`max` er som standard i dag → fire år frem (søk/ønskeliste).
 */
export function EuControlDateField({
  id,
  value,
  onChange,
  min,
  max,
  ...inputProps
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
} & Pick<ComponentProps<"input">, "aria-invalid" | "aria-describedby" | "aria-required">) {
  const today = new Date();
  const maxDate = new Date(today.getFullYear() + MAX_YEARS_AHEAD, 11, 31);
  return (
    <Input
      {...inputProps}
      id={id}
      type="date"
      className="w-full"
      value={value}
      min={min ?? isoDate(today)}
      max={max ?? isoDate(maxDate)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
