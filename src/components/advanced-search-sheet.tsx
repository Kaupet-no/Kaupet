import { useEffect, useMemo, useState } from "react";
import { X, Plus, Save, Search as SearchIcon, RotateCcw } from "lucide-react";

import { PushEnablePrompt } from "@/components/push-enable-prompt";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ModeToggle } from "@/components/mode-toggle";
import { TermGroupEditor } from "@/components/term-group-editor";
import type { Category, SortValue } from "@/lib/categories";
import { mergeTermGroups, type TermGroup } from "@/lib/term-groups";
import { useAuth } from "@/lib/auth";
import { createSavedSearch, summarizeCriteria, type SearchCriteria } from "@/lib/saved-searches";
import { toast } from "sonner";
import { formatErrorMessage } from "@/lib/errors";

export { ModeToggle };

export const CONDITIONS: Array<{ value: string; label: string }> = [
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
  sort: SortValue;
  extraGroups: TermGroup[];
};

export function defaultAdvancedSearchValue(): AdvancedSearchValue {
  return {
    terms: [],
    qMode: "all",
    categories: [],
    catMode: "any",
    conditions: [],
    min: null,
    max: null,
    includeFree: true,
    location: { lat: null, lng: null, radius: 10, label: "" },
    sort: "new",
    extraGroups: [],
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdvancedSearchValue;
  categories: Category[];
  onApply: (v: AdvancedSearchValue) => void;
  /** Current sort order, included in criteria handed to the save-search dialog. */
  currentSort?: SearchCriteria["sort"];
  /** Label for the primary footer action (default "Bruk søk"). */
  applyLabel?: string;
  /** Hide the internal "Lagre søk" action — used when this sheet is already
   * editing the filters of an existing saved search, where "save as new"
   * doesn't make sense. */
  hideSaveAction?: boolean;
};

export function AdvancedSearchSheet({
  open,
  onOpenChange,
  initial,
  categories,
  onApply,
  currentSort,
  applyLabel = "Bruk søk",
  hideSaveAction = false,
}: Props) {
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

  const toggleCondition = (val: string) =>
    setV({
      ...v,
      conditions: v.conditions.includes(val)
        ? v.conditions.filter((c) => c !== val)
        : [...v.conditions, val],
    });

  const handleReset = () => setV({ ...defaultAdvancedSearchValue(), sort: v.sort });
  const handleApply = () => {
    onApply({ ...v, extraGroups: mergeTermGroups(v.extraGroups) });
    onOpenChange(false);
  };

  const criteria: SearchCriteria = { ...valueToCriteria(v), sort: currentSort ?? v.sort };
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

            {/* Flere søkelinjer (inkluder/ekskluder) */}
            <section className="space-y-2">
              <Label className="text-sm font-medium">Flere søkelinjer</Label>
              <TermGroupEditor
                groups={v.extraGroups}
                onChange={(extraGroups) => setV({ ...v, extraGroups })}
              />
            </section>

            {/* Kategori */}
            <CategoryPicker
              categories={categories}
              selected={v.categories}
              onChange={(slugs) => setV({ ...v, categories: slugs, catMode: "any" })}
            />

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
              <div className="rounded-md border border-border p-1">
                <RadiusPicker
                  value={v.location.radius}
                  onChange={(r) => setV({ ...v, location: { ...v.location, radius: r } })}
                  disabled={v.location.lat == null}
                />
              </div>
              {v.location.lat == null && (
                <p className="text-xs text-muted-foreground">
                  Velg sted overfor for å aktivere radius.
                </p>
              )}
            </section>
          </div>

          <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="size-4" /> Nullstill
            </Button>
            <div className="flex gap-2">
              {user && !hideSaveAction && (
                <Button type="button" variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
                  <Save className="size-4" /> Lagre søk
                </Button>
              )}
              <Button type="button" size="sm" onClick={handleApply}>
                <SearchIcon className="size-4" /> {applyLabel}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {!hideSaveAction && (
        <SaveSearchDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          defaultName={defaultName}
          criteria={criteria}
          onSaved={() => {
            setSaveOpen(false);
          }}
        />
      )}
    </>
  );
}

export function CategoryPicker({
  categories,
  selected,
  onChange,
}: {
  categories: Category[];
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  const ALL = "__all__";
  const parents = useMemo(() => categories.filter((c) => c.parent_id == null), [categories]);
  const childrenById = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const p of parents) {
      map.set(
        p.id,
        categories.filter((c) => c.parent_id === p.id),
      );
    }
    return map;
  }, [categories, parents]);

  // Derive main category from selected slugs (all selected must belong to same parent)
  const selectedCats = categories.filter((c) => selected.includes(c.slug));
  const firstSel = selectedCats[0];
  const mainCat = firstSel
    ? firstSel.parent_id == null
      ? firstSel
      : (categories.find((c) => c.id === firstSel.parent_id) ?? null)
    : null;
  const mainSlug = mainCat?.slug ?? "";
  const subs = mainCat ? (childrenById.get(mainCat.id) ?? []) : [];
  const selectedSubSlugs = new Set(
    selectedCats.filter((c) => c.parent_id != null).map((c) => c.slug),
  );

  const onMainChange = (val: string) => {
    if (val === ALL) onChange([]);
    else onChange([val]);
  };

  const toggleSub = (slug: string) => {
    const next = new Set(selectedSubSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    // When at least one sub is selected, store only sub slugs (drop the main).
    // When none, fall back to just the main slug (= "all subs").
    if (next.size === 0) onChange(mainSlug ? [mainSlug] : []);
    else onChange(Array.from(next));
  };

  return (
    <section className="space-y-2">
      <Label className="text-sm font-medium">Kategori</Label>
      <Select value={mainSlug || ALL} onValueChange={onMainChange}>
        <SelectTrigger>
          <SelectValue placeholder="Alle hovedkategorier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle hovedkategorier</SelectItem>
          {parents.map((p) => (
            <SelectItem key={p.id} value={p.slug}>
              {p.name_nb}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mainCat && subs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Underkategorier (velg én eller flere — tomt = alle)
          </p>
          <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {subs.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selectedSubSlugs.has(s.slug)}
                  onCheckedChange={() => toggleSub(s.slug)}
                />
                <span>{s.name_nb}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function hasNoFilters(c: SearchCriteria): boolean {
  const hasTerms = (c.terms?.length ?? 0) > 0 || !!c.q?.trim();
  return (
    !hasTerms &&
    !(c.extraGroups?.length ?? 0) &&
    !(c.categories?.length ?? 0) &&
    !(c.conditions?.length ?? 0) &&
    c.min == null &&
    c.max == null &&
    !c.loc
  );
}

export function SaveSearchDialog({
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
      toast.error(formatErrorMessage(e, "Kunne ikke lagre søket"));
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
            <Checkbox checked={notify} onCheckedChange={(c) => setNotify(c === true)} />
            Varsle meg om nye treff
          </label>
          {hasNoFilters(criteria) && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              Dette søket har ingen filtre og vil varsle deg om <strong>alle</strong> nye annonser
              på Kaupet.
            </p>
          )}
          {notify && <PushEnablePrompt variant="inline" />}
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
    sort: v.sort,
    extraGroups: v.extraGroups,
    lat: v.location.lat,
    lng: v.location.lng,
    radius: v.location.lat != null ? v.location.radius : null,
    loc: v.location.label || undefined,
  };
}

export function criteriaToValue(c: SearchCriteria): AdvancedSearchValue {
  const terms = c.terms?.length ? c.terms : c.q ? c.q.split(/\s+/).filter(Boolean) : [];
  return {
    terms,
    qMode: c.qMode ?? "all",
    categories: c.categories ?? [],
    catMode: c.catMode ?? "any",
    conditions: c.conditions ?? [],
    min: c.min ?? null,
    max: c.max ?? null,
    includeFree: c.includeFree ?? true,
    sort: c.sort ?? "new",
    extraGroups: c.extraGroups ?? [],
    location: {
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      radius: c.radius ?? 10,
      label: c.loc ?? "",
    },
  };
}
