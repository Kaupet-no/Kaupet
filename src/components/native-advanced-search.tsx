import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Save,
  Search as SearchIcon,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryPicker, SaveSearchDialog } from "@/components/advanced-search-sheet";
import { TermGroupRow } from "@/components/term-group-editor";
import {
  CONDITIONS,
  isBilOgMcCategory,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import { emptyTermGroup, type TermGroup } from "@/lib/term-groups";
import { useAuth } from "@/hooks/use-auth";
import { useAdvancedSearchValue } from "@/hooks/use-advanced-search-value";
import {
  buildAdvancedSearchCriteria,
  mergeAdvancedSearchGroups,
  resetAdvancedSearchValue,
} from "@/lib/advanced-search-actions";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { useFocusTrap } from "@/hooks/use-focus-trap";

type Props = {
  open: boolean;
  onClose: () => void;
  initial: AdvancedSearchValue;
  categories: Category[];
  onApply: (v: AdvancedSearchValue) => void;
  /** Label for the primary footer action (default "Bruk søk"). */
  applyLabel?: string;
  /** Hide the internal "Lagre" action — used when this overlay is already
   * editing the filters of an existing saved search, where "save as new"
   * doesn't make sense. */
  hideSaveAction?: boolean;
};

export function NativeAdvancedSearch({
  open,
  onClose,
  initial,
  categories,
  onApply,
  applyLabel = "Bruk søk",
  hideSaveAction = false,
}: Props) {
  const { user } = useAuth();
  const [v, setV] = useAdvancedSearchValue(open, initial);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TermGroup | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open);

  const handleReset = () => {
    void hapticImpact("light");
    setV(resetAdvancedSearchValue(v));
  };

  const handleApply = () => {
    void hapticNotification("success");
    onApply(mergeAdvancedSearchGroups(v));
    onClose();
  };

  const saveGroup = (group: TermGroup) => {
    if (group.terms.length === 0) {
      setEditingGroup(null);
      return;
    }
    void hapticImpact("medium");
    setV((prev) => {
      const exists = prev.extraGroups.some((g) => g.id === group.id);
      return {
        ...prev,
        extraGroups: exists
          ? prev.extraGroups.map((g) => (g.id === group.id ? group : g))
          : [...prev.extraGroups, group],
      };
    });
    setEditingGroup(null);
  };

  const removeGroup = (id: string) => {
    void hapticImpact("light");
    setV((prev) => ({ ...prev, extraGroups: prev.extraGroups.filter((g) => g.id !== id) }));
  };

  const { criteria, defaultName } = buildAdvancedSearchCriteria(v);

  // The Sheet (editingGroup) is rendered outside the portal so it sits in the
  // normal React tree. Its Radix portal uses z-[10000] and safely appears above
  // the z-[9999] overlay below.
  return (
    <>
      {open &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Avansert søk"
            className="fixed inset-0 z-[9999] flex flex-col bg-background animate-in slide-in-from-bottom-4 duration-200"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border px-4 pt-safe pb-3">
              <button
                type="button"
                onClick={() => {
                  void hapticImpact("light");
                  onClose();
                }}
                className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                aria-label="Tilbake"
              >
                <ArrowLeft className="size-5" />
              </button>
              <h2 className="font-display text-lg tracking-tight">Avansert søk</h2>
              <button
                type="button"
                onClick={handleReset}
                className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Nullstill
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 pb-safe">
              {/* Extra search lines */}
              <section className="space-y-3">
                <Label className="text-sm font-medium">Flere søkelinjer</Label>

                {v.extraGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      void hapticImpact("light");
                      setEditingGroup(g);
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
                      g.exclude ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${g.exclude ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {g.exclude ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block text-sm font-medium ${g.exclude ? "text-destructive" : ""}`}
                      >
                        {g.exclude ? "Ekskluder" : "Inkluder"} —{" "}
                        {g.mode === "all" ? "alle ord" : "minst ett ord"}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {g.terms.length > 0 ? g.terms.join(", ") : "Ingen ord lagt til"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeGroup(g.id);
                      }}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label="Fjern søkelinje"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    void hapticImpact("light");
                    setEditingGroup(emptyTermGroup());
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground transition active:scale-[0.98] hover:border-primary hover:text-primary"
                >
                  <Plus className="size-4" />
                  Legg til søkelinje
                </button>
              </section>

              {/* Categories */}
              <CategoryPicker
                categories={categories}
                selected={v.categories}
                onChange={(slugs) =>
                  setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))
                }
              />

              {/* Price */}
              <section className="space-y-3">
                <Label className="text-sm font-medium">Pris (NOK)</Label>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="adv-min" className="text-xs text-muted-foreground">
                      Fra
                    </Label>
                    <Input
                      id="adv-min"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={v.min ?? ""}
                      onChange={(e) =>
                        setV((prev) => ({
                          ...prev,
                          min: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      className="h-11"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="adv-max" className="text-xs text-muted-foreground">
                      Til
                    </Label>
                    <Input
                      id="adv-max"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="–"
                      value={v.max ?? ""}
                      onChange={(e) =>
                        setV((prev) => ({
                          ...prev,
                          max: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      className="h-11"
                    />
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={v.includeFree}
                    onCheckedChange={(c) => {
                      void hapticImpact("light");
                      setV((prev) => ({ ...prev, includeFree: c === true }));
                    }}
                    id="adv-free"
                  />
                  <Label htmlFor="adv-free" className="cursor-pointer text-base">
                    Inkluder gratis-annonser
                  </Label>
                </label>
              </section>

              {/* Condition */}
              {!isBilOgMcCategory(categories, v.categories) && (
                <section className="space-y-3">
                  <Label className="text-sm font-medium">Tilstand</Label>
                  <div className="flex flex-col gap-3">
                    {CONDITIONS.map((c) => (
                      <label
                        key={c.value}
                        className="flex cursor-pointer items-center gap-3 py-0.5"
                      >
                        <Checkbox
                          checked={v.conditions.includes(c.value)}
                          onCheckedChange={() => {
                            void hapticImpact("light");
                            setV((prev) => ({
                              ...prev,
                              conditions: prev.conditions.includes(c.value)
                                ? prev.conditions.filter((x) => x !== c.value)
                                : [...prev.conditions, c.value],
                            }));
                          }}
                          id={`adv-cond-${c.value}`}
                        />
                        <Label htmlFor={`adv-cond-${c.value}`} className="cursor-pointer text-base">
                          {c.label}
                        </Label>
                      </label>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Sticky footer */}
            <div className="border-t border-border px-4 py-3 pb-safe flex gap-2">
              {user && !hideSaveAction && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setSaveOpen(true)}
                  className="gap-2"
                >
                  <Save className="size-4" /> Lagre
                </Button>
              )}
              <Button type="button" size="lg" onClick={handleApply} className="flex-1 gap-2">
                <SearchIcon className="size-4" /> {applyLabel}
              </Button>
            </div>

            {!hideSaveAction && (
              <SaveSearchDialog
                open={saveOpen}
                onOpenChange={setSaveOpen}
                defaultName={defaultName}
                criteria={criteria}
                onSaved={() => setSaveOpen(false)}
              />
            )}
          </div>,
          document.body,
        )}

      {/* Term group sheet — lives outside the portal so its own Radix portal
          (z-[10000]) stacks above the z-[9999] overlay without conflicts */}
      <TermGroupSheet
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSave={saveGroup}
      />
    </>
  );
}

function TermGroupSheet({
  group,
  onClose,
  onSave,
}: {
  group: TermGroup | null;
  onClose: () => void;
  onSave: (g: TermGroup) => void;
}) {
  const [draft, setDraft] = useState<TermGroup>(group ?? emptyTermGroup());

  useEffect(() => {
    if (group) setDraft(group);
  }, [group]);

  const updateDraft = (next: TermGroup) => {
    void hapticImpact("light");
    setDraft(next);
  };

  return (
    <Sheet
      open={group !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Søkelinje</SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <TermGroupRow group={draft} onChange={updateDraft} />
        </div>

        <Button
          type="button"
          size="lg"
          className="mt-6 w-full"
          disabled={draft.terms.length === 0}
          onClick={() => onSave(draft)}
        >
          {draft.terms.length === 0 ? "Legg til minst ett ord" : "Lagre søkelinje"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
