import { useEffect, useState } from "react";
import { ChevronDown, RotateCcw, Save, Search as SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CategoryPicker,
  CONDITIONS,
  SaveSearchDialog,
  defaultAdvancedSearchValue,
  valueToCriteria,
  type AdvancedSearchValue,
} from "@/components/advanced-search-sheet";
import { TermGroupEditor } from "@/components/term-group-editor";
import type { Category } from "@/lib/categories";
import { mergeTermGroups } from "@/lib/term-groups";
import { useAuth } from "@/lib/auth";
import { summarizeCriteria, type SearchCriteria } from "@/lib/saved-searches";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdvancedSearchValue;
  categories: Category[];
  onApply: (v: AdvancedSearchValue) => void;
  /** Extra control rendered on the same line as the trigger button — used to
   * place the sort control next to "Flere søkeparametere" instead of inside
   * the search bar, where it could get scrolled out of view. */
  sortControl?: React.ReactNode;
};

export function AdvancedSearchPanel({
  open,
  onOpenChange,
  initial,
  categories,
  onApply,
  sortControl,
}: Props) {
  const { user } = useAuth();
  const [v, setV] = useState<AdvancedSearchValue>(initial);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (open) setV(initial);
  }, [open, initial]);

  const toggleCondition = (val: string) =>
    setV({
      ...v,
      conditions: v.conditions.includes(val)
        ? v.conditions.filter((c) => c !== val)
        : [...v.conditions, val],
    });

  const handleReset = () =>
    setV({ ...defaultAdvancedSearchValue(), terms: v.terms, location: v.location, sort: v.sort });
  const handleApply = () => {
    onApply({ ...v, extraGroups: mergeTermGroups(v.extraGroups) });
    onOpenChange(false);
  };

  const advancedFilterCount =
    (v.categories.length > 0 ? 1 : 0) +
    (v.conditions.length > 0 ? 1 : 0) +
    (v.min != null || v.max != null ? 1 : 0) +
    (v.qMode === "any" ? 1 : 0) +
    (v.extraGroups.length > 0 ? 1 : 0);

  const criteria: SearchCriteria = { ...valueToCriteria(v), sort: v.sort };
  const defaultName = summarizeCriteria(criteria);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex items-center gap-1 px-1 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Flere søkeparametere
            <ChevronDown className="size-4 transition-transform duration-200 group-hover:translate-y-0.5 group-data-[state=open]:rotate-180" />
            {advancedFilterCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </button>
        </CollapsibleTrigger>
        {sortControl}
      </div>
      <CollapsibleContent>
        <div className="mt-2 space-y-6 rounded-2xl border border-border bg-card p-4">
          <section className="space-y-2">
            <Label className="text-sm font-medium">Flere søkelinjer</Label>
            <TermGroupEditor
              groups={v.extraGroups}
              onChange={(extraGroups) => setV({ ...v, extraGroups })}
            />
          </section>

          <CategoryPicker
            categories={categories}
            selected={v.categories}
            onChange={(slugs) => setV({ ...v, categories: slugs, catMode: "any" })}
          />

          <section className="space-y-2">
            <Label className="text-sm font-medium">Pris (NOK)</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="number"
                min={0}
                placeholder="Fra"
                value={v.min ?? ""}
                onChange={(e) =>
                  setV({ ...v, min: e.target.value ? Number(e.target.value) : null })
                }
              />
              <span className="hidden text-muted-foreground sm:inline">–</span>
              <Input
                type="number"
                min={0}
                placeholder="Til"
                value={v.max ?? ""}
                onChange={(e) =>
                  setV({ ...v, max: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={v.includeFree}
                onCheckedChange={(c) => setV({ ...v, includeFree: c === true })}
              />
              Inkluder gratis annonser
            </label>
          </section>

          <section className="space-y-2">
            <Label className="text-sm font-medium">Tilstand</Label>
            <div className="grid grid-cols-1 gap-1 rounded-md border border-border p-2 sm:grid-cols-2">
              {CONDITIONS.map((c) => (
                <label
                  key={c.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={v.conditions.includes(c.value)}
                    onCheckedChange={() => toggleCondition(c.value)}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="w-full sm:w-auto"
            >
              <RotateCcw className="size-4" /> Nullstill
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {user && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveOpen(true)}
                  className="w-full sm:w-auto"
                >
                  <Save className="size-4" /> Lagre søk
                </Button>
              )}
              <Button type="button" size="sm" onClick={handleApply} className="w-full sm:w-auto">
                <SearchIcon className="size-4" /> Bruk søk
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>

      <SaveSearchDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultName={defaultName}
        criteria={criteria}
        onSaved={() => setSaveOpen(false)}
      />
    </Collapsible>
  );
}
