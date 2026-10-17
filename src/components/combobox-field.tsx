import { useState } from "react";
import { Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type ComboboxOption = { value: string; label_nb: string };

/**
 * Multiselect checklist with a filter field — picking one doesn't close the
 * surrounding popover/sheet, since checking one value is exactly when a user
 * is likely to want to check another — plus a free-text fallback. Used for
 * open-vocabulary fields where more than one value can apply at once (e.g.
 * Merke, matching the Bil brand/model multiselect pattern in
 * attribute-filter-chips.tsx's BrandMultiChip).
 *
 * Ekte avkrysningsbokser, ikke cmdk: cmdk tvinger role="option" og bruker
 * aria-selected for aktiv rad, og Chromium på Android ignorerer aria-checked
 * på option. TalkBack leste da aktiv rad som valgt og faktisk valg som
 * ikke-valgt (KG-36-F01).
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
  const trimmed = search.trim();
  const normalizedSearch = trimmed.toLowerCase();
  const visible = options.filter((o) => o.label_nb.toLowerCase().includes(normalizedSearch));
  const exactMatch = options.find((o) => o.label_nb.toLowerCase() === normalizedSearch);

  const addFreeform = () => {
    onToggle(trimmed);
    setSearch("");
  };

  return (
    <div>
      <Input
        type="search"
        enterKeyHint="done"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !trimmed) return;
          e.preventDefault();
          if (exactMatch) onToggle(exactMatch.value);
          else addFreeform();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="rounded-none border-0 border-b shadow-none focus-visible:ring-0"
      />
      <ul className="max-h-[300px] overflow-y-auto p-1">
        {visible.map((o) => (
          <li key={o.value}>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent">
              {/* Radix-boksen er en <button>; Chromium navngir den ikke fra
                  omsluttende <label>. */}
              <Checkbox
                checked={values.includes(o.value)}
                onCheckedChange={() => onToggle(o.value)}
                aria-label={o.label_nb}
              />
              {o.label_nb}
            </label>
          </li>
        ))}
        {trimmed && !exactMatch && (
          <li>
            <button
              type="button"
              onClick={addFreeform}
              className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent"
            >
              <Plus className="size-4" aria-hidden="true" />
              Legg til «{trimmed}»
            </button>
          </li>
        )}
        {visible.length === 0 && !trimmed && (
          <li className="py-6 text-center text-sm text-muted-foreground">Ingen treff.</li>
        )}
      </ul>
    </div>
  );
}
