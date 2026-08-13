import { useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NativeSheet } from "@/components/ui/native-sheet";
import { cn } from "@/lib/utils";

export type NativeChoiceOption = {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: NativeChoiceOption[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  searchable?: boolean;
  onApply?: () => void;
};

/** Shared phone-sized choice surface for search filters. Desktop keeps Select. */
export function NativeChoiceSheet({ open, value, ...props }: Props) {
  return (
    <NativeChoiceSheetInner
      key={`${open}-${value.join("\u0000")}`}
      open={open}
      value={value}
      {...props}
    />
  );
}

function NativeChoiceSheetInner({
  open,
  onOpenChange,
  title,
  options,
  value,
  onChange,
  multiple = false,
  searchable = options.length > 12,
  onApply,
}: Props) {
  const [draft, setDraft] = useState(value);

  const usesDraft = multiple || onApply != null;
  const current = usesDraft ? draft : value;
  const selected = new Set(current);
  const toggle = (next: string) => {
    const values = multiple
      ? selected.has(next)
        ? current.filter((item) => item !== next)
        : [...current, next]
      : selected.has(next)
        ? []
        : [next];
    if (usesDraft) {
      setDraft(values);
      return;
    }
    onChange(values);
    onOpenChange(false);
  };
  const content = (
    <Command shouldFilter={searchable} className="bg-transparent">
      {searchable && <CommandInput placeholder="Søk i valg…" />}
      <CommandList className="max-h-[min(60dvh,32rem)] px-2">
        <CommandEmpty>Ingen valg passer søket.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = selected.has(option.value);
            return (
              <CommandItem
                key={option.value}
                value={option.label}
                disabled={option.disabled}
                onSelect={() => toggle(option.value)}
                aria-selected={isSelected}
                className="native-touch-target min-h-14 rounded-lg px-3 text-base"
              >
                {multiple ? (
                  <Checkbox checked={isSelected} aria-label={option.label} tabIndex={-1} />
                ) : (
                  <span
                    className={cn(
                      "grid size-6 place-content-center rounded-full border border-primary",
                      isSelected && "bg-primary text-primary-foreground",
                    )}
                    aria-hidden
                  >
                    {isSelected && <Check className="size-4" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">{option.label}</span>
                {option.count != null && (
                  <span className="text-sm tabular-nums text-muted-foreground">{option.count}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  return (
    <NativeSheet open={open} onOpenChange={onOpenChange} title={title} titleVisible expandable>
      <div className="mt-3 min-h-0">{content}</div>
      {onApply && (
        <Button
          type="button"
          size="native"
          className="mt-4 w-full"
          onClick={() => {
            onChange(draft);
            onApply();
          }}
        >
          Bruk valg
        </Button>
      )}
    </NativeSheet>
  );
}
