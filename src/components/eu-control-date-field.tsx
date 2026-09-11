import { Input } from "@/components/ui/input";

/** Fire år frem er så langt en EU-kontrollfrist realistisk kan ligge. */
const MAX_YEARS_AHEAD = 4;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Datofelt for EU-kontroll. `<input type="date">` snakker allerede ISO
 * (`yyyy-MM-dd`) — samme format som SVV leverer og som vi lagrer — og gir
 * brukeren plattformens egen datovelger, som er den native appen vil ha.
 */
export function EuControlDateField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const today = new Date();
  const maxDate = new Date(today.getFullYear() + MAX_YEARS_AHEAD, 11, 31);
  return (
    <Input
      id={id}
      type="date"
      className="w-full"
      value={value}
      min={isoDate(today)}
      max={isoDate(maxDate)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
