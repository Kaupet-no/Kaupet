import { lazy, Suspense, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { useIsDesktop } from "@/hooks/use-form-factor";

/** Fire år frem er så langt en EU-kontrollfrist realistisk kan ligge. */
const MAX_YEARS_AHEAD = 4;

// Forsiden importerer feltet via søkebrikkene; kalenderen lastes først på desktop.
const DesktopDatePicker = lazy(() =>
  import("@/components/desktop-date-picker").then((m) => ({ default: m.DesktopDatePicker })),
);

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Datofelt for EU-kontroll og andre datoattributter (filtertypen `date` og
 * `CategoryBehavior.extraDateAttributes`). Verdien er alltid ISO
 * (`yyyy-MM-dd`) — samme format som SVV leverer og som vi lagrer.
 *
 * Native app og smal nettleser får `<input type="date">` (plattformens egen
 * velger, med hjul/årsliste på mobil). Nettleser ≥ 1024px får shadcn-
 * kalenderen med måned/år-nedtrekk. Ingen av dem tar fritekst, så et ugyldig
 * format kan ikke oppstå. `min`/`max` er som standard i dag → fire år frem.
 */
export function EuControlDateField({
  id,
  value,
  onChange,
  min,
  max,
  ...ariaProps
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
} & Pick<ComponentProps<"input">, "aria-invalid" | "aria-describedby" | "aria-required">) {
  const isDesktop = useIsDesktop();
  const today = new Date();
  const minDate = min ?? isoDate(today);
  const maxDate = max ?? isoDate(new Date(today.getFullYear() + MAX_YEARS_AHEAD, 11, 31));
  const nativeInput = (
    <Input
      {...ariaProps}
      id={id}
      type="date"
      className="w-full"
      value={value}
      min={minDate}
      max={maxDate}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (!isDesktop) return nativeInput;
  return (
    <Suspense fallback={nativeInput}>
      <DesktopDatePicker
        {...ariaProps}
        id={id}
        value={value}
        min={minDate}
        max={maxDate}
        onChange={onChange}
      />
    </Suspense>
  );
}
