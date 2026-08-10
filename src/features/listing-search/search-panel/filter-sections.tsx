import { useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryPicker } from "@/components/advanced-search-sheet";
import { TermGroupRow } from "@/components/term-group-editor";
import { FilterChip } from "@/components/filter-chip";
import { SecondaryCategoryFilters } from "@/components/attribute-filter-chips";
import {
  CONDITIONS,
  isBilOgMcCategory,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import { emptyTermGroup, type TermGroup } from "@/lib/term-groups";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { hapticImpact } from "@/lib/haptics";

/** Tab keys for the parameter sections. Named `*Section` rather than `*Tab`
 * because the search panel (fase 9) reaches them from its summary pill, not
 * only from a tab strip. */
export type SearchFilterSection = "search" | "categories" | "price" | "location" | "attributes";

type Props = {
  value: AdvancedSearchValue;
  setValue: React.Dispatch<React.SetStateAction<AdvancedSearchValue>>;
  categories: Category[];
  section: SearchFilterSection;
  onSectionChange: (s: SearchFilterSection) => void;
  /** Sted er eid av søkeflaten og oppdateres umiddelbart, i motsetning til
   * resten som samles i et utkast og committes ved "Bruk søk" — se
   * kommentaren over handleApply i use-annonser-search-state.ts. Utelates ved
   * redigering av et lagret søk (mine-sok.tsx), der sted i stedet er en del av
   * utkastet. */
  location?: LocationValue;
  onLocationChange?: (v: LocationValue) => void;
  /** Kategoriens sekundære attributtfiltre. Utelatt betyr ingen "Mer"-fane. */
  attributeFilters?: CategoryFilter[];
  attributeValues?: Record<string, AttributeFilterValue>;
  onAttributeChange?: (key: string, value: AttributeFilterValue | undefined) => void;
  attributeCounts?: Record<string, Record<string, number>>;
  /** Se `SecondaryCategoryFilters`: søkepanelet må vise hele filtersettet,
   * siden det er eneste vei dit på native etter fase 9. */
  includePrimary?: boolean;
};

/**
 * Parameterfanene (Kategori · Pris · Sted · Mer · Søk) som både
 * `SearchPanel` (fase 9) og `NativeAdvancedSearch` (redigering av lagret søk)
 * rendrer. Utkastholdingen, headeren og bunnknappene eies av kallstedet —
 * denne komponenten er bare seksjonene.
 */
export function SearchFilterSections({
  value: v,
  setValue: setV,
  categories,
  section,
  onSectionChange,
  location: locationProp,
  onLocationChange: onLocationChangeProp,
  attributeFilters,
  attributeValues,
  onAttributeChange,
  attributeCounts,
  includePrimary = false,
}: Props) {
  const [editingGroup, setEditingGroup] = useState<TermGroup | null>(null);

  const showCondition = !isBilOgMcCategory(categories, v.categories);
  // Falls back to editing the draft's own location when no live location is
  // passed in (saved-search editing on mine-sok.tsx), so the "Sted" tab works
  // in both contexts without a second code path.
  const location = locationProp ?? v.location;
  const onLocationChange =
    onLocationChangeProp ??
    ((next: LocationValue) => setV((prev) => ({ ...prev, location: next })));
  const locationActive = location.lat != null;
  const hasAttributeFilters =
    attributeFilters != null && attributeValues != null && onAttributeChange != null;

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

  return (
    <>
      <Tabs
        value={section}
        onValueChange={(s) => onSectionChange(s as SearchFilterSection)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList
          className={`mx-4 mt-3 grid ${hasAttributeFilters ? "grid-cols-5" : "grid-cols-4"}`}
        >
          <TabsTrigger value="categories" className="px-1.5 text-xs sm:text-sm">
            Kategori
          </TabsTrigger>
          <TabsTrigger value="price" className="px-1.5 text-xs sm:text-sm">
            Pris
          </TabsTrigger>
          <TabsTrigger value="location" className="px-1.5 text-xs sm:text-sm">
            Sted
          </TabsTrigger>
          {hasAttributeFilters && (
            <TabsTrigger value="attributes" className="px-1.5 text-xs sm:text-sm">
              Mer
            </TabsTrigger>
          )}
          <TabsTrigger value="search" className="px-1.5 text-xs sm:text-sm">
            Søk
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <TabsContent value="categories" className="mt-0">
            <CategoryPicker
              categories={categories}
              selected={v.categories}
              onChange={(slugs) => setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))}
            />
          </TabsContent>

          <TabsContent value="price" className="mt-0 space-y-6">
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

            {showCondition && (
              <section className="space-y-3">
                <Label className="text-sm font-medium">Tilstand</Label>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map((c) => (
                    <FilterChip
                      key={c.value}
                      label={c.label}
                      active={v.conditions.includes(c.value)}
                      hideChevron
                      onClick={() => {
                        void hapticImpact("light");
                        setV((prev) => ({
                          ...prev,
                          conditions: prev.conditions.includes(c.value)
                            ? prev.conditions.filter((x) => x !== c.value)
                            : [...prev.conditions, c.value],
                        }));
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </TabsContent>

          <TabsContent value="location" className="mt-0 space-y-4">
            <LocationPicker value={location} onChange={onLocationChange} autoFocus={false} />
            {locationActive && (
              <RadiusPicker
                value={location.radius}
                onChange={(r) => onLocationChange({ ...location, radius: r })}
              />
            )}
          </TabsContent>

          {hasAttributeFilters && (
            <TabsContent value="attributes" className="mt-0">
              <SecondaryCategoryFilters
                filters={attributeFilters!}
                values={attributeValues!}
                onChange={onAttributeChange!}
                counts={attributeCounts}
                isNative
                includePrimary={includePrimary}
              />
            </TabsContent>
          )}

          <TabsContent value="search" className="mt-0">
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
          </TabsContent>
        </div>
      </Tabs>

      {/* Term group sheet — its own Radix Dialog, stacks above the panel since
          it only mounts (and portals) once the user opens it */}
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
