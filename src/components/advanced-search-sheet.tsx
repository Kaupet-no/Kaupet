import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X, Plus, Save, Search as SearchIcon, RotateCcw } from "lucide-react";

import { PushEnablePrompt } from "@/components/push-enable-prompt";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { LocationPicker, RadiusPicker } from "@/components/location-filter";
import { ModeToggle } from "@/components/search-term-mode-toggle";
import { TermGroupEditor } from "@/components/term-group-editor";
import { type Category } from "@/lib/categories";
import { useAuth } from "@/hooks/use-auth";
import { useAdvancedSearchValue } from "@/hooks/use-advanced-search-value";
import {
  buildAdvancedSearchCriteria,
  mergeAdvancedSearchGroups,
  resetAdvancedSearchValue,
} from "@/lib/advanced-search-actions";
import { createSavedSearch, summarizeCriteria, type SearchCriteria } from "@/lib/saved-searches";
import { trackProductEvent } from "@/lib/product-analytics";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";

export { ModeToggle };

import {
  BIL_OG_MC_SLUG,
  conditionOptionsFor,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";

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
  const [v, setV] = useAdvancedSearchValue(open, initial);
  const [termDraft, setTermDraft] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (open) setTermDraft("");
  }, [open]);

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

  const handleReset = () => setV(resetAdvancedSearchValue(v));
  const handleApply = () => {
    onApply(mergeAdvancedSearchGroups(v));
    onOpenChange(false);
  };

  const { criteria, defaultName } = buildAdvancedSearchCriteria(v, currentSort);
  const conditionOptions = conditionOptionsFor(v.categories);

  return (
    <>
      <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
        <ResponsiveOverlayContent
          className="flex max-h-[90vh] w-full flex-col gap-0 p-0 sm:max-w-md"
          expandable
        >
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Avansert søk</DialogTitle>
            <DialogDescription>
              Kombiner flere kriterier for å finne akkurat det du leter etter.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {/* Søkeord */}
            <section className="space-y-2">
              <Label className="text-sm font-medium">Søkeord</Label>
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

            <Collapsible
              key={v.qMode === "any" || v.extraGroups.length > 0 ? "active" : "default"}
              defaultOpen={v.qMode === "any" || v.extraGroups.length > 0}
            >
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="group gap-1 px-0 text-primary"
                >
                  Flere søkevalg
                  <ChevronDown
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Søket skal matche</Label>
                  <ModeToggle
                    value={v.qMode}
                    onChange={(qMode) => setV({ ...v, qMode })}
                    labels={["Alle ordene", "Minst ett ord"]}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Ekstra regler</Label>
                  <TermGroupEditor
                    groups={v.extraGroups}
                    onChange={(extraGroups) => setV({ ...v, extraGroups })}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

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
                {conditionOptions.map((c) => (
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

          <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
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
          </DialogFooter>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>

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
  /** Icon row (matching the web hero's category picker) instead of a select
   * dropdown, for the native filter panel — see `SearchFilterSections`. */
  variant = "select",
}: {
  categories: Category[];
  selected: string[];
  onChange: (slugs: string[]) => void;
  variant?: "select" | "icons";
}) {
  const ALL = "__all__";
  const parents = useMemo(() => categories.filter((c) => c.parent_id == null), [categories]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      const arr = map.get(c.parent_id) ?? [];
      arr.push(c);
      map.set(c.parent_id, arr);
    }
    return map;
  }, [categories]);

  // Derive main category from selected slugs by walking up to the root
  // ancestor, so the "hovedkategori" select reflects the right branch no
  // matter which depth the user picked a subcategory at.
  const selectedCats = useMemo(
    () => categories.filter((c) => selected.includes(c.slug)),
    [categories, selected],
  );
  const mainCat = useMemo(() => {
    const firstSel = selectedCats[0];
    if (!firstSel) return null;
    let cur = firstSel;
    while (cur.parent_id) {
      const parent = categories.find((c) => c.id === cur.parent_id);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  }, [selectedCats, categories]);
  const mainSlug = mainCat?.slug ?? "";
  const selectedSubSlugs = useMemo(
    () => new Set(selectedCats.filter((c) => c.parent_id != null).map((c) => c.slug)),
    [selectedCats],
  );

  const onMainChange = (val: string) => {
    if (val === ALL) onChange([]);
    else onChange([val]);
  };
  const isBilOgMc = mainSlug === BIL_OG_MC_SLUG;
  const toggleSub = (slug: string) => {
    if (isBilOgMc) {
      onChange(selectedSubSlugs.has(slug) ? (mainSlug ? [mainSlug] : []) : [slug]);
      return;
    }
    const next = new Set(selectedSubSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(next.size === 0 ? (mainSlug ? [mainSlug] : []) : [...next]);
  };
  const hasSubs = !!mainCat && (childrenByParent.get(mainCat.id) ?? []).length > 0;

  return (
    <section className="space-y-2">
      <Label className="text-sm font-medium">Kategori</Label>
      {variant === "icons" ? (
        <NativeCategoryDrilldown categories={categories} selected={selected} onChange={onChange} />
      ) : (
        <>
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
          {mainCat && hasSubs && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Underkategorier (velg én eller flere — tomt = alle)
              </p>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2">
                <CategoryLevelList
                  parentId={mainCat.id}
                  depth={0}
                  childrenByParent={childrenByParent}
                  selectedSubSlugs={selectedSubSlugs}
                  toggleSub={toggleSub}
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NativeCategoryDrilldown({
  categories,
  selected,
  onChange,
}: {
  categories: Category[];
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  const [path, setPath] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    for (const category of categories) {
      const siblings = map.get(category.parent_id) ?? [];
      siblings.push(category);
      map.set(category.parent_id, siblings);
    }
    return map;
  }, [categories]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const currentParent = path.at(-1) ?? null;
  const currentLevel = childrenByParent.get(currentParent?.id ?? null) ?? [];
  const filteredLevel = query.trim()
    ? categories.filter((category) =>
        category.name_nb.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
    : currentLevel;
  const breadcrumb = path.map((category) => category.name_nb).join(" › ");
  const hasChildren = (id: string) => (childrenByParent.get(id) ?? []).length > 0;
  const descendants = (id: string): Category[] => {
    const direct = childrenByParent.get(id) ?? [];
    return direct.flatMap((category) => [category, ...descendants(category.id)]);
  };
  const mainCategory = path[0] ?? null;
  const isBilOgMc = mainCategory?.slug === BIL_OG_MC_SLUG;

  const toggleCategory = (category: Category) => {
    if (hasChildren(category.id)) {
      setPath((previous) => [...previous, category]);
      setQuery("");
      return;
    }
    if (isBilOgMc) {
      onChange(selectedSet.has(category.slug) ? [mainCategory.slug] : [category.slug]);
      return;
    }
    const next = new Set(selected.filter((slug) => slug !== mainCategory?.slug));
    if (next.has(category.slug)) next.delete(category.slug);
    else next.add(category.slug);
    onChange(next.size > 0 ? [...next] : mainCategory ? [mainCategory.slug] : []);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Søk i kategorier"
          aria-label="Søk i kategorier"
          className="h-12 pl-9"
        />
      </div>
      {path.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPath((previous) => previous.slice(0, -1));
              setQuery("");
            }}
            className="native-touch-target flex items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary"
          >
            <ChevronDown className="size-4 rotate-90" aria-hidden />
            Tilbake
          </button>
          <span className="truncate text-sm text-muted-foreground">{breadcrumb}</span>
        </div>
      )}
      {path.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([mainCategory!.slug])}
          className="native-touch-target flex min-h-14 w-full items-center justify-between rounded-xl border border-dashed border-primary/50 px-4 text-left text-sm font-medium text-primary"
        >
          <span>Alt i {mainCategory!.name_nb}</span>
          <span>Velg</span>
        </button>
      )}
      <div className="space-y-1">
        {filteredLevel.map((category) => {
          const isSelected = selectedSet.has(category.slug);
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleCategory(category)}
              className={`native-touch-target flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base ${
                isSelected ? "bg-primary/10 font-medium text-primary" : "bg-muted"
              }`}
            >
              <span className="min-w-0 flex-1">{category.name_nb}</span>
              {isSelected ? (
                <span aria-hidden>✓</span>
              ) : hasChildren(category.id) ? (
                <ChevronDown className="size-4 -rotate-90" aria-hidden />
              ) : null}
            </button>
          );
        })}
        {filteredLevel.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">Ingen kategorier funnet</p>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">
          {selected.length > 0 ? `${selected.length} valgt` : "Alle kategorier"}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="native-touch-target px-2 text-primary"
          >
            Nullstill
          </button>
        )}
      </div>
    </div>
  );
}

/** Renders every descendant level below the main category, not just its
 * direct children, indented by depth — so a 3-level branch exposes leaves
 * like "Bil" or "Motorsykkel" here too, matching the depth the
 * create-listing and homepage category pickers already allow. A standalone
 * (not nested-closure) component so the React Compiler can memoize it. */
function CategoryLevelList({
  parentId,
  depth,
  childrenByParent,
  selectedSubSlugs,
  toggleSub,
}: {
  parentId: string;
  depth: number;
  childrenByParent: Map<string, Category[]>;
  selectedSubSlugs: Set<string>;
  toggleSub: (slug: string) => void;
}) {
  const items = childrenByParent.get(parentId) ?? [];
  if (items.length === 0) return null;
  return (
    <div className={depth > 0 ? "ml-4 space-y-0.5" : "space-y-0.5"}>
      {items.map((s) => (
        <div key={s.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <Checkbox
              checked={selectedSubSlugs.has(s.slug)}
              onCheckedChange={() => toggleSub(s.slug)}
            />
            <span>{s.name_nb}</span>
          </label>
          <CategoryLevelList
            parentId={s.id}
            depth={depth + 1}
            childrenByParent={childrenByParent}
            selectedSubSlugs={selectedSubSlugs}
            toggleSub={toggleSub}
          />
        </div>
      ))}
    </div>
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
      showErrorToast("Gi søket et navn");
      return;
    }
    setSaving(true);
    try {
      await createSavedSearch(name.trim(), criteria, notify);
      trackProductEvent("search_saved", { notify });
      showSuccessToast("Søk lagret");
      onSaved();
    } catch (e) {
      showErrorToast(formatErrorMessage(e, "Kunne ikke lagre søket"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lagre søk</DialogTitle>
          <DialogDescription>Lagre søket og få beskjed når nye annonser matcher.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted/60 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Dette lagres</p>
          <p className="mt-1 text-sm">{summarizeCriteria(criteria)}</p>
        </div>
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
            <Alert variant="warning" className="p-2">
              <AlertDescription className="text-xs">
                Dette søket har ingen filtre og vil varsle deg om <strong>alle</strong> nye annonser
                på Kaupet.
              </AlertDescription>
            </Alert>
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
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
