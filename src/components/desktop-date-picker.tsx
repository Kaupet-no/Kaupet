import { useState, type ComponentProps } from "react";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { nb } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ISO = "yyyy-MM-dd";

/**
 * shadcn-kalender i popover for nettleser på brede skjermer. Lastes lazy fra
 * `EuControlDateField`, så forsiden ikke drar med seg react-day-picker.
 * Måned/år-nedtrekk gjør det raskt å hoppe langt frem eller tilbake.
 */
export function DesktopDatePicker({
  id,
  value,
  onChange,
  min,
  max,
  "aria-describedby": describedBy,
  ...ariaProps
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  min: string;
  max: string;
} & Pick<ComponentProps<"button">, "aria-invalid" | "aria-describedby" | "aria-required">) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const invalid = !!value && !selected;
  const minDate = parseISO(min);
  const maxDate = parseISO(max);
  // Etiketten (htmlFor) navngir knappen; datoen leses som beskrivelse.
  const valueId = `${id}-value`;
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...ariaProps}
          id={id}
          aria-invalid={invalid || ariaProps["aria-invalid"] || undefined}
          aria-describedby={[valueId, describedBy].filter(Boolean).join(" ")}
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
        >
          <span id={valueId} className={selected ? undefined : "text-muted-foreground"}>
            {selected ? format(selected, "dd.MM.yyyy") : "Ingen dato valgt"}
          </span>
          <CalendarIcon aria-hidden className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={nb}
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected && selected >= minDate && selected <= maxDate ? selected : minDate}
          startMonth={minDate}
          endMonth={maxDate}
          disabled={[{ before: minDate }, { after: maxDate }]}
          onSelect={(date) => choose(date ? format(date, ISO) : "")}
          autoFocus
        />
        {value && (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => choose("")}
            >
              Fjern dato
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
