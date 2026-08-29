import { useState } from "react";
import { Check } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label_nb: string };

/**
 * Multiselect variant of the single-value combobox above — a checkbox list (picking one
 * doesn't close the popover, since checking one value is exactly when a
 * user is likely to want to check another) plus the same free-text
 * fallback. Used for open-vocabulary fields where more than one value can
 * apply at once (e.g. Merke, matching the Bil brand/model multiselect
 * pattern in attribute-filter-chips.tsx's BrandMultiChip).
 */
export function ComboboxMultiContent({
  values,
  options,
  onToggle,
  placeholder = "Søk eller skriv inn...",
}: {
  values: string[];
  options: ComboboxOption[];
  onToggle: (value: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const exactMatch = options.some((o) => o.label_nb.toLowerCase() === normalizedSearch);

  return (
    <Command shouldFilter>
      <CommandInput placeholder={placeholder} value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>Ingen treff.</CommandEmpty>
        <CommandGroup>
          {options.map((o) => (
            <CommandItem key={o.value} value={o.label_nb} onSelect={() => onToggle(o.value)}>
              <Check
                className={cn("size-4", values.includes(o.value) ? "opacity-100" : "opacity-0")}
              />
              {o.label_nb}
            </CommandItem>
          ))}
          {search.trim() && !exactMatch && (
            <CommandItem
              value={`__freeform__${search}`}
              onSelect={() => {
                onToggle(search.trim());
                setSearch("");
              }}
            >
              <Check className="size-4 opacity-0" />
              Legg til «{search.trim()}»
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
