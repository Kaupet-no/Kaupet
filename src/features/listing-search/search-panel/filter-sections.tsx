import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSheet } from "@/components/ui/native-sheet";
import { CategoryPicker } from "@/components/advanced-search-sheet";
import { TermGroupRow } from "@/components/term-group-editor";
import { FilterChip } from "@/components/filter-chip";
import { SecondaryCategoryFilters } from "@/components/attribute-filter-chips";
import { RangeFilterField } from "@/components/range-filter-field";
import { SwipeToDeleteRow } from "@/components/swipe-to-delete-row";
import { PRICE_BOUNDS } from "@/lib/filter-range-bounds";
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
import type { ActiveFilterItem } from "./active-filter-items";

/** Section keys, kept from the old tab strip (fase 9) — now scroll targets
 * inside one continuous list instead of separate tab panels (fase 12). */
export type SearchFilterSection = "search" | "categories" | "price" | "location" | "attributes";

type Props = {
  value: AdvancedSearchValue;
  setValue: React.Dispatch<React.SetStateAction<AdvancedSearchValue>>;
  categories: Category[];
  /** Seksjonen panelet skal scrolle til når den endres — en "hopp hit"-input,
   * ikke en tab-valgt tilstand (fase 12 erstattet fanene med én scrollende
   * liste, se komponentkommentaren). */
  section: SearchFilterSection;
  /** Valgfri eksplisitt stedstilstand for eldre kallere. SearchPanel og
   * lagret-søk-redigering bruker normalt sted fra samme utkast som resten. */
  location?: LocationValue;
  onLocationChange?: (v: LocationValue) => void;
  /** Kategoriens sekundære attributtfiltre. Utelatt betyr ingen egen seksjon. */
  attributeFilters?: CategoryFilter[];
  attributeValues?: Record<string, AttributeFilterValue>;
  onAttributeChange?: (key: string, value: AttributeFilterValue | undefined) => void;
  attributeCounts?: Record<string, Record<string, number>>;
  /** Se `SecondaryCategoryFilters`: søkepanelet må vise hele filtersettet,
   * siden det er eneste vei dit på native etter fase 9. */
  includePrimary?: boolean;
  /** Aktive filtertagger — vises øverst med swipe-for-å-fjerne (fase 12).
   * Utelatt (ikke bare tom liste) skjuler seksjonen helt, for kallere som
   * ikke sporer aktive filtre som en flat liste (mine-sok.tsx). */
  activeItems?: ActiveFilterItem[];
};

/**
 * Parameterseksjonene (Aktive filter · Kategori · Pris · Tilstand · Sted ·
 * Mer · Søk) som både `SearchPanel` (fase 9/12) og `NativeAdvancedSearch`
 * (redigering av lagret søk) rendrer. Én scrollende liste i stedet for faner
 * (fase 12) — å dra panelet til fullskjerm skal gi mer synlig innhold, ikke
 * bare mer luft under én fane. Utkastholdingen, headeren og bunnknappene eies
 * av kallstedet — denne komponenten er bare seksjonene.
 */
export function SearchFilterSections({
  value: v,
  setValue: setV,
  categories,
  section,
  location: locationProp,
  onLocationChange: onLocationChangeProp,
  attributeFilters,
  attributeValues,
  onAttributeChange,
  attributeCounts,
  includePrimary = false,
  activeItems,
}: Props) {
  const [editingGroup, setEditingGroup] = useState<TermGroup | null>(null);
  // A single container ref + `data-section` attributes instead of one ref
  // callback per section — the compiler flags per-render ref-callback
  // factories as a potential read-during-render, and `querySelector` scoped
  // to this list sidesteps that without losing the "jump to section" scroll.
  const listRef = useRef<HTMLDivElement>(null);

  // `section` is a scroll target here, not a tab selection — jumping to it
  // (e.g. the summary pill opening straight on "Pris") scrolls the list
  // instead of switching a panel.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-section="${section}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [section]);

  const showCondition = !isBilOgMcCategory(categories, v.categories);
  // Falls back to editing the draft's own location when no live location is
  // passed in (saved-search editing on mine-sok.tsx), so the "Sted" section
  // works in both contexts without a second code path.
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
      {/* pb: rom til bunnbaren, som nå er en egen skjermbunn-pinnet flate
          (se search-panel.tsx) i stedet for siste rad i denne listen —
          uten dette ville "Legg til søkelinje" ligge skjult bak den. */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]"
      >
        {activeItems && activeItems.length > 0 && (
          <section className="mb-6 space-y-2">
            <Label className="text-base font-medium">Aktive filter</Label>
            <div className="space-y-2">
              {activeItems.map((item) => (
                <SwipeToDeleteRow key={item.key} onDelete={item.onRemove} deleteLabel="Fjern">
                  <div className="flex min-h-11 items-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
                    {item.label}
                  </div>
                </SwipeToDeleteRow>
              ))}
            </div>
          </section>
        )}

        <section
          data-section="categories"
          className="scroll-mt-2 space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          {/* Ingen egen seksjonstittel her — CategoryPicker rendrer selv en
              "Kategori"-label, og å ha begge rett over hverandre er bare
              gjentakelse uten merverdi. */}
          <CategoryPicker
            categories={categories}
            selected={v.categories}
            onChange={(slugs) => setV((prev) => ({ ...prev, categories: slugs, catMode: "any" }))}
            variant="icons"
          />
        </section>

        <section
          data-section="location"
          className="mt-4 scroll-mt-2 space-y-4 rounded-2xl border border-border bg-card p-4"
        >
          <Label className="text-base font-medium">Sted</Label>
          <LocationPicker value={location} onChange={onLocationChange} autoFocus={false} />
          {locationActive && (
            <RadiusPicker
              value={location.radius}
              onChange={(r) => onLocationChange({ ...location, radius: r })}
            />
          )}
        </section>

        <section
          data-section="price"
          className="mt-4 scroll-mt-2 space-y-6 rounded-2xl border border-border bg-card p-4"
        >
          <div className="space-y-3">
            {/* Ingen egen seksjonstittel — RangeFilterField rendrer selv en
                "Pris (NOK)"-label rett under. */}
            <RangeFilterField
              label="Pris (NOK)"
              bounds={PRICE_BOUNDS}
              value={{ min: v.min ?? undefined, max: v.max ?? undefined }}
              onChange={({ min, max }) =>
                setV((prev) => ({ ...prev, min: min ?? null, max: max ?? null }))
              }
            />
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
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
          </div>

          {showCondition && (
            <div className="space-y-3">
              <Label className="text-base font-medium">Tilstand</Label>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => (
                  <FilterChip
                    key={c.value}
                    label={c.label}
                    active={v.conditions.includes(c.value)}
                    hideChevron
                    className="min-h-11"
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
            </div>
          )}
        </section>

        <section
          data-section="attributes"
          className="mt-4 scroll-mt-2 space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <Label className="text-base font-medium">Flere filter</Label>
          {hasAttributeFilters && v.categories.length > 0 ? (
            <SecondaryCategoryFilters
              filters={attributeFilters!}
              values={attributeValues!}
              onChange={onAttributeChange!}
              counts={attributeCounts}
              isNative
              includePrimary={includePrimary}
            />
          ) : (
            <button
              type="button"
              onClick={() =>
                listRef.current
                  ?.querySelector('[data-section="categories"]')
                  ?.scrollIntoView({ block: "start" })
              }
              className="flex min-h-11 w-full items-center rounded-xl border border-dashed border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground"
            >
              Velg kategori for å låse opp kategorispesifikke filtre
            </button>
          )}
        </section>

        <section
          data-section="search"
          className="mt-4 scroll-mt-2 space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <Label className="text-base font-medium">Flere søkelinjer</Label>

          {v.extraGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                void hapticImpact("light");
                setEditingGroup(g);
              }}
              className={`flex min-h-11 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
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
                className="native-hit-area shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
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
            className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground transition active:scale-[0.98] hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
            Legg til søkelinje
          </button>
        </section>
      </div>

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
    <NativeSheet
      open={group !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Søkelinje"
      titleVisible
      className="max-h-[85vh] overflow-y-auto"
    >
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
    </NativeSheet>
  );
}
