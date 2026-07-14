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
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryPicker, SaveSearchDialog } from "@/components/advanced-search-sheet";
import {
  CONDITIONS,
  defaultAdvancedSearchValue,
  valueToCriteria,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import { emptyTermGroup, mergeTermGroups, type TermGroup } from "@/lib/term-groups";
import { useAuth } from "@/lib/use-auth";
import { summarizeCriteria, type SearchCriteria } from "@/lib/saved-searches";
import { hapticImpact, hapticNotification } from "@/lib/haptics";

type Props = {
  open: boolean;
  onClose: () => void;
  initial: AdvancedSearchValue;
  categories: Category[];
  onApply: (v: AdvancedSearchValue) => void;
};

export function NativeAdvancedSearch({ open, onClose, initial, categories, onApply }: Props) {
  const { user } = useAuth();
  const [v, setV] = useState<AdvancedSearchValue>(initial);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TermGroup | null>(null);

  const initialRef = useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  });
  useEffect(() => {
    if (open) setV(initialRef.current);
  }, [open]);

  const handleReset = () => {
    void hapticImpact("light");
    setV({ ...defaultAdvancedSearchValue(), terms: v.terms, location: v.location, sort: v.sort });
  };

  const handleApply = () => {
    void hapticNotification("success");
    onApply({ ...v, extraGroups: mergeTermGroups(v.extraGroups) });
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

  const criteria: SearchCriteria = { ...valueToCriteria(v), sort: v.sort };

  // The Sheet (editingGroup) is rendered outside the portal so it sits in the
  // normal React tree. Its Radix portal uses z-[10000] and safely appears above
  // the z-[9999] overlay below.
  return (
    <>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col bg-background animate-in slide-in-from-bottom-4 duration-200">
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
              <section className="space-y-3">
                <Label className="text-sm font-medium">Tilstand</Label>
                <div className="flex flex-col gap-3">
                  {CONDITIONS.map((c) => (
                    <label key={c.value} className="flex cursor-pointer items-center gap-3 py-0.5">
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
            </div>

            {/* Sticky footer */}
            <div className="border-t border-border px-4 py-3 pb-safe flex gap-2">
              {user && (
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
                <SearchIcon className="size-4" /> Bruk søk
              </Button>
            </div>

            <SaveSearchDialog
              open={saveOpen}
              onOpenChange={setSaveOpen}
              defaultName={summarizeCriteria(criteria)}
              criteria={criteria}
              onSaved={() => setSaveOpen(false)}
            />
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
  const [termInput, setTermInput] = useState("");

  useEffect(() => {
    if (group) {
      setDraft(group);
      setTermInput("");
    }
  }, [group]);

  const addTerm = () => {
    const t = termInput.trim();
    if (!t || draft.terms.includes(t)) {
      setTermInput("");
      return;
    }
    void hapticImpact("light");
    setDraft((prev) => ({ ...prev, terms: [...prev.terms, t] }));
    setTermInput("");
  };

  const removeTerm = (t: string) => {
    void hapticImpact("light");
    setDraft((prev) => ({ ...prev, terms: prev.terms.filter((x) => x !== t) }));
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

        <div className="mt-4 space-y-5">
          {/* Include / Exclude */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: false, label: "Inkluder", desc: "Vis annonser med disse ordene" },
                { value: true, label: "Ekskluder", desc: "Skjul annonser med disse ordene" },
              ].map(({ value, label, desc }) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => {
                    void hapticImpact("light");
                    setDraft((p) => ({ ...p, exclude: value }));
                  }}
                  className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
                    draft.exclude === value
                      ? value
                        ? "border-destructive bg-destructive/5 text-destructive"
                        : "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* All / Any */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Match-modus</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "all" as const, label: "Alle ord", desc: "Alle ord må finnes" },
                { value: "any" as const, label: "Minst ett ord", desc: "Minst ett ord må finnes" },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    void hapticImpact("light");
                    setDraft((p) => ({ ...p, mode: value }));
                  }}
                  className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
                    draft.mode === value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Term input */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Ord</Label>
            <div className="flex gap-2">
              <Input
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTerm();
                  }
                }}
                placeholder="f.eks. rød"
                className="h-11"
              />
              <Button type="button" variant="outline" onClick={addTerm} className="h-11 shrink-0">
                <Plus className="size-4" /> Legg til
              </Button>
            </div>

            {draft.terms.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {draft.terms.map((t) => (
                  <span
                    key={t}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
                      draft.exclude ? "bg-destructive/10 text-destructive" : "bg-muted"
                    }`}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTerm(t)}
                      className="rounded-full p-0.5 opacity-60 hover:opacity-100"
                      aria-label={`Fjern ${t}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
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
