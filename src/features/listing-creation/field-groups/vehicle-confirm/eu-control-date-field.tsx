import { lazy, Suspense, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { parseIsoDate, startOfToday } from "./spec";

const Calendar = lazy(() =>
  import("@/components/ui/calendar").then((module) => ({ default: module.Calendar })),
);

/** `mode="future"` (default) is for dates like EU-kontroll that must lie
 * ahead of today; `mode="past"` is for dates like førstegangsregistrering
 * that must lie behind it. Both share the same ISO-in/dd.MM.yyyy-out
 * behavior — only which half of the calendar is selectable differs. */
export function EuControlDateField({
  id,
  value,
  onChange,
  mode = "future",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  mode?: "future" | "past";
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseIsoDate(value);
  const today = startOfToday();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          className="w-full justify-start font-normal"
        >
          <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
          {selectedDate ? format(selectedDate, "dd.MM.yyyy") : "Velg dato"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Suspense
          fallback={
            <div className="flex h-80 w-72 items-center justify-center text-sm text-muted-foreground">
              Laster kalender …
            </div>
          }
        >
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selectedDate}
            disabled={mode === "future" ? { before: today } : { after: today }}
            startMonth={mode === "future" ? today : new Date(1970, 0)}
            endMonth={mode === "future" ? new Date(new Date().getFullYear() + 4, 11) : today}
            onSelect={(date) => {
              if (date) onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
