import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SORT_OPTIONS, type SortValue } from "@/lib/categories";

type Props = {
  sort: SortValue;
  onSortChange: (v: SortValue) => void;
};

export function SortControl({ sort, onSortChange }: Props) {
  const [open, setOpen] = useState(false);
  const sortLabel = SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Nyeste først";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1 px-1 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {sortLabel}
          <ChevronDown className="size-4 transition-transform duration-200 group-hover:translate-y-0.5 group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(200px,calc(100vw-2rem))] p-1">
        {SORT_OPTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => {
              onSortChange(s.value);
              setOpen(false);
            }}
            className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted ${
              sort === s.value ? "bg-muted font-medium" : ""
            }`}
          >
            {s.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
