import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
 * "Pick from a curated list, or type your own" content for fields like
 * Merke (brand), where the option list is a helpful suggestion (see
 * suggest_attribute_values RPC / Fase 2.6) rather than an exhaustive,
 * closed vocabulary — unlike Drivstoff/Girkasse, which really do have a
 * fixed set of valid values. Free text always wins if it doesn't match an
 * existing option, so a seller with an uncommon brand isn't blocked.
 */
export function ComboboxContent({
  value,
  options,
  onChange,
  placeholder = "Søk eller skriv inn...",
}: {
  value: string | undefined;
  options: ComboboxOption[];
  onChange: (value: string | undefined) => void;
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
            <CommandItem
              key={o.value}
              value={o.label_nb}
              onSelect={() => {
                onChange(o.value);
                setSearch("");
              }}
            >
              <Check className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")} />
              {o.label_nb}
            </CommandItem>
          ))}
          {search.trim() && !exactMatch && (
            <CommandItem
              value={`__freeform__${search}`}
              onSelect={() => {
                onChange(search.trim());
                setSearch("");
              }}
            >
              <Check className="size-4 opacity-0" />
              Bruk «{search.trim()}»
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** Full labeled field wrapping ComboboxContent in its own trigger button —
 * drop-in alternative to the plain <Select> branch in CategoryFilterFields
 * for keys that should stay open-vocabulary (see genericBrandFilterFor). */
export function ComboboxField({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  options: ComboboxOption[];
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((o) => o.value === value)?.label_nb ?? value;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !currentLabel && "text-muted-foreground")}>
              {currentLabel || `Velg ${label.toLowerCase()}`}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <ComboboxContent
            value={value}
            options={options}
            onChange={(v) => {
              onChange(v);
              setOpen(false);
            }}
            placeholder={placeholder}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
