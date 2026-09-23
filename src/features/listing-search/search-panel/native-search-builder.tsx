import { useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

import type { AdvancedSearchValue } from "@/components/advanced-search-value";
import { NativeChoiceSheet } from "@/components/ui/native-choice-sheet";
import { emptyTermGroup, type TermGroup } from "@/lib/term-groups";
import { TermGroupSheet } from "./filter-sections";

export function NativeSearchBuilder({
  value,
  setValue,
  expanded,
  onExpandedChange,
}: {
  value: AdvancedSearchValue;
  setValue: Dispatch<SetStateAction<AdvancedSearchValue>>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [modeOpen, setModeOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TermGroup | null>(null);

  const saveGroup = (group: TermGroup) => {
    setValue((previous) => ({
      ...previous,
      extraGroups: previous.extraGroups.some((item) => item.id === group.id)
        ? previous.extraGroups.map((item) => (item.id === group.id ? group : item))
        : [...previous.extraGroups, group],
    }));
    setEditingGroup(null);
  };

  return (
    <>
      <section
        className={`border-t border-border ${expanded ? "min-h-0 flex-1 overflow-y-auto" : "shrink-0"}`}
      >
        <button
          type="button"
          className="native-touch-target flex min-h-14 w-full items-center justify-between px-4 text-left text-sm font-semibold"
          aria-expanded={expanded}
          aria-controls={expanded ? "native-search-rules" : undefined}
          onClick={() => onExpandedChange(!expanded)}
        >
          Presiser søket
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {expanded && (
          <div id="native-search-rules" className="border-t border-border px-4 pb-3">
            <button
              type="button"
              className="native-touch-target flex min-h-14 w-full items-center justify-between gap-3 border-b border-border py-3 text-left"
              onClick={() => setModeOpen(true)}
            >
              <span className="min-w-0 text-sm">
                <span className="block font-medium">
                  {value.qMode === "all" ? "Må inneholde" : "Kan inneholde"}
                </span>
                <span className="block break-words text-muted-foreground">
                  {value.terms.length > 0 ? value.terms.join(", ") : "Ordene i søkefeltet"}
                </span>
              </span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                {value.qMode === "all" ? "Alle ordene" : "Minst ett ord"}
                <ChevronRight className="size-4" aria-hidden />
              </span>
            </button>
            {value.extraGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className="native-touch-target flex min-h-14 w-full items-center justify-between gap-3 border-b border-border py-3 text-left"
                onClick={() => setEditingGroup(group)}
              >
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">
                    {group.exclude
                      ? "Skjul annonser som inneholder"
                      : group.mode === "all"
                        ? "Må inneholde"
                        : "Kan inneholde"}
                  </span>
                  <span className="block break-words text-muted-foreground">
                    {group.terms.join(", ")}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              className="native-touch-target flex min-h-14 items-center gap-2 text-sm font-medium text-primary"
              onClick={() => setEditingGroup(emptyTermGroup())}
            >
              <Plus className="size-4" aria-hidden />
              Legg til søkeregel
            </button>
          </div>
        )}
      </section>

      <NativeChoiceSheet
        open={modeOpen}
        onOpenChange={setModeOpen}
        title="Ordene i søkefeltet"
        options={[
          { value: "all", label: "Alle ordene" },
          { value: "any", label: "Minst ett ord" },
        ]}
        value={[value.qMode]}
        onChange={(selection) => {
          const mode = selection[0];
          if (mode === "all" || mode === "any") {
            setValue((previous) => ({ ...previous, qMode: mode }));
          }
        }}
      />
      <TermGroupSheet
        group={editingGroup}
        title="Søkeregel"
        onClose={() => setEditingGroup(null)}
        onSave={saveGroup}
        onRemove={
          editingGroup && value.extraGroups.some((item) => item.id === editingGroup.id)
            ? (id) => {
                setValue((previous) => ({
                  ...previous,
                  extraGroups: previous.extraGroups.filter((item) => item.id !== id),
                }));
                setEditingGroup(null);
              }
            : undefined
        }
      />
    </>
  );
}
