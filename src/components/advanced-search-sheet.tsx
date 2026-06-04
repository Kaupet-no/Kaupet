import { useEffect, useMemo, useState } from "react";
import { X, Plus, Save, Search as SearchIcon, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import type { Category } from "@/components/search-bar";
import { useAuth } from "@/lib/auth";
import { createSavedSearch, summarizeCriteria, type SearchCriteria } from "@/lib/saved-searches";
import { toast } from "sonner";

const CONDITIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "Helt ny" },
  { value: "like_new", label: "Som ny" },
  { value: "good", label: "Pent brukt" },
  { value: "worn", label: "Brukt med slitasje" },
  { value: "for_parts", label: "Må repareres" },
];

export type AdvancedSearchValue = {
  terms: string[];
  qMode: "all" | "any";
  categories: string[];
  catMode: "all" | "any";
  conditions: string[];
  min: number | null;
  max: number | null;
  includeFree: boolean;
  location: LocationValue;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdvancedSearchValue;
  categories: Category[];
  onApply: (v: AdvancedSearchValue) => void;
};

export function AdvancedSearchSheet({ open, onOpenChange, initial, categories, onApply }: Props) {
  const { user } = useAuth();
  const [v, setV] = useState<AdvancedSearchValue>(initial);
  const [termDraft, setTermDraft] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setV(initial);
      setTermDraft("");
    }
  }, [open, initial]);

  const addTerm = () => {
    const t = termDraft.trim();
    if (!t) return;
    if (v.terms.includes(t)) {
      setTermDraft("");
      return;
    }
    setV({ ...v, terms: [...v.terms, t] });
    setTermDraft("");
  };

  const removeTerm = (t: string) => setV({ ...v, terms: v.terms.filter((x) => x !== t) });

  const toggleCat = (slug: string) =>
    setV({
      ...v,
      categories: v.categories.includes(slug)
        ? v.categories.filter((c) => c !== slug)
        : [...v.categories, slug],
    });

  const toggleCondition = (val: string) =>
    setV({
      ...v,
      conditions: v.conditions.includes(val)
        ? v.conditions.filter((c) => c !== val)
        : [...v.conditions, val],
    });

  const reset: AdvancedSearchValue = useMemo(
    () => ({
      terms: [],
      qMode: "all",
      categories: [],
      catMode: "any",
      conditions: [],
      min: null,
      max: null,
      includeFree: true,
      location: { lat: null, lng: null, radius: 10, label: "" },
    }),
    [],
  );

  const handleReset = () => setV(reset);
  const handleApply = () => {
    onApply(v);
    onOpenChange(false);
  };

  const criteria: SearchCriteria = valueToCriteria(v);
  const defaultName = summarizeCriteria(criteria);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>Avansert søk</SheetTitle>
            <SheetDescription>
              Kombiner flere kriterier for å finne akkurat det du leter etter.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {/* Søkeord */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Søkeord</Label>
                <ModeToggle
                  value={v.qMode}
                  onChange={(m) => setV({ ...v, qMode: m })}
                  labels={["Alle ord", "Minst ett"]}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  value={termDraft}
                  onChange={(e) => setTermDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTerm();
                    }
                  }}
                  placeholder="f.eks. sykkel"
                />
                <Button type="button" size="sm" variant="outline" onClick={addTerm}>
                  <Plus className="size-4" /> Legg til
                </Button>
              </div>
              {v.terms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {v.terms.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTerm(t)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Fjern ${t}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Kategorier */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Kategorier</Label>
                <ModeToggle
                  value={v.catMode}
                  onChange={(m) => setV({ ...v, catMode: m })}
                  labels={["Alle", "Minst én"]}
                />
              </div>
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={v.categories.includes(c.slug)}
                      onCheckedChange={() => toggleCat(c.slug)}
                    />
                    <span>{c.name_nb}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Pris */}
            <section className="space-y-2">
              <Label className="text-sm font-medium">Pris (NOK)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="Fra"
                  value={v.min ?? ""}
                  onChange={(e) =>
                    setV({ ...v, min: e.target.value ? Number(e.target.value) : null })
                  }
                />
                <span className="text-muted-foreground">–</span>
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

            {/* Tilstand */}
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

            {/* Lokasjon */}
            <section className="space-y-2">
              <Label className="text-sm font-medium">Lokasjon</Label>
              <div className="rounded-md border border-border p-1">
                <LocationPicker
                  value={v.location}
                  onChange={(loc) => setV({ ...v, location: loc })}
                />
              </div>
              {v.location.lat != null && (
                <div className="rounded-md border border-border p-1">
                  <RadiusPicker
                    value={v.location.radius}
                    onChange={(r) => setV({ ...v, location: { ...v.location, radius: r } })}
                  />
                </div>
              )}
            </section>
          </div>

          <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="size-4" /> Nullstill
            </Button>
            <div className="flex gap-2">
              {user && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveOpen(true)}
                >
                  <Save className="size-4" /> Lagre søk
                </Button>
              )}
              <Button type="button" size="sm" onClick={handleApply}>
                <SearchIcon className="size-4" /> Bruk søk
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <SaveSearchDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultName={defaultName}
        criteria={criteria}
        onSaved={() => {
          setSaveOpen(false);
        }}
      />
    </>
  );
}

function ModeToggle({
  value,
  onChange,
  labels,
}: {
  value: "all" | "any";
  onChange: (v: "all" | "any") => void;
  labels: [string, string];
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`rounded-full px-2.5 py-1 transition ${
          value === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        {labels[0]}
      </button>
      <button
        type="button"
        onClick={() => onChange("any")}
        className={`rounded-full px-2.5 py-1 transition ${
          value === "any" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        {labels[1]}
      </button>
    </div>
  );
}

function SaveSearchDialog({
  open,
  onOpenChange,
  defaultName,
  criteria,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultName: string;
  criteria: SearchCriteria;
  onSaved: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setNotify(true);
    }
  }, [open, defaultName]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Gi søket et navn");
      return;
    }
    setSaving(true);
    try {
      await createSavedSearch(name.trim(), criteria, notify);
      toast.success("Søk lagret");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre søk");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lagre søk</DialogTitle>
          <DialogDescription>
            Du finner lagrede søk under "Mine søk" og vil bli varslet om nye treff.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="saved-search-name">Navn</Label>
            <Input
              id="saved-search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="f.eks. Sykler i Oslo"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={notify}
              onCheckedChange={(c) => setNotify(c === true)}
            />
            Varsle meg om nye treff
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Lagrer…" : "Lagre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function valueToCriteria(v: AdvancedSearchValue): SearchCriteria {
  return {
    terms: v.terms,
    qMode: v.qMode,
    categories: v.categories,
    catMode: v.catMode,
    conditions: v.conditions,
    min: v.min,
    max: v.max,
    includeFree: v.includeFree,
    lat: v.location.lat,
    lng: v.location.lng,
    radius: v.location.lat != null ? v.location.radius : null,
    loc: v.location.label || undefined,
  };
}
