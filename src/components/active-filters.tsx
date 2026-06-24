import { X } from "lucide-react";

import { hapticImpact } from "@/lib/haptics";
import { useIsNative } from "@/lib/use-is-native";
import { TermGroupChips } from "@/components/term-group-editor";
import { CONDITIONS } from "@/components/advanced-search-value";
import type { Category } from "@/lib/categories";
import type { TermGroup } from "@/lib/term-groups";

type SearchLike = {
  q: string;
  qMode: "all" | "any";
  extraGroups: TermGroup[];
  category: string;
  categories: string[];
  conditions: string[];
  min?: number;
  max?: number;
  includeFree: boolean;
  lat?: number;
  lng?: number;
  radius?: number;
  loc?: string;
};

type Props = {
  search: SearchLike;
  categories: Category[];
  terms: string[];
  effectiveCategories: string[];
  onUpdate: (patch: Partial<SearchLike>) => void;
};

export function ActiveFilters({ search, categories, terms, effectiveCategories, onUpdate }: Props) {
  const hasLine1 = terms.length > 0;
  const hasPrice = search.min != null || search.max != null;
  const hasLocation = search.lat != null && search.lng != null;
  const hasAnyFilter =
    hasLine1 ||
    search.extraGroups.length > 0 ||
    effectiveCategories.length > 0 ||
    search.conditions.length > 0 ||
    hasPrice ||
    !search.includeFree ||
    hasLocation;

  if (!hasAnyFilter) return null;

  const removeLine1Term = (term: string) => {
    onUpdate({ q: terms.filter((t) => t !== term).join(" ") });
  };

  const removeGroupTerm = (groupId: string, term: string) => {
    const next = search.extraGroups
      .map((g) => (g.id === groupId ? { ...g, terms: g.terms.filter((t) => t !== term) } : g))
      .filter((g) => g.terms.length > 0);
    onUpdate({ extraGroups: next });
  };

  const removeCategory = (slug: string) => {
    onUpdate({
      categories: effectiveCategories.filter((s) => s !== slug),
      category: search.category === slug ? "" : search.category,
    });
  };

  const removeCondition = (value: string) => {
    onUpdate({ conditions: search.conditions.filter((c) => c !== value) });
  };

  const removePrice = () => onUpdate({ min: undefined, max: undefined });
  const removeIncludeFree = () => onUpdate({ includeFree: true });
  const removeLocation = () =>
    onUpdate({ lat: undefined, lng: undefined, radius: undefined, loc: undefined });

  let priceLabel = "";
  if (search.min != null && search.max != null) priceLabel = `${search.min} kr – ${search.max} kr`;
  else if (search.min != null) priceLabel = `Fra ${search.min} kr`;
  else if (search.max != null) priceLabel = `Til ${search.max} kr`;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {hasLine1 && (
        <div className="rounded-md border border-border p-2">
          <TermGroupChips
            group={{ id: "q", mode: search.qMode, exclude: false, terms }}
            onRemoveTerm={removeLine1Term}
          />
        </div>
      )}
      {search.extraGroups.map((g) => (
        <div key={g.id} className="rounded-md border border-border p-2">
          <TermGroupChips group={g} onRemoveTerm={(t) => removeGroupTerm(g.id, t)} />
        </div>
      ))}
      {effectiveCategories.map((slug) => {
        const name = categories.find((c) => c.slug === slug)?.name_nb ?? slug;
        return <FilterChip key={slug} label={name} onRemove={() => removeCategory(slug)} />;
      })}
      {priceLabel && <FilterChip label={priceLabel} onRemove={removePrice} />}
      {!search.includeFree && (
        <FilterChip label="Uten gratis annonser" onRemove={removeIncludeFree} />
      )}
      {search.conditions.map((value) => {
        const label = CONDITIONS.find((c) => c.value === value)?.label ?? value;
        return <FilterChip key={value} label={label} onRemove={() => removeCondition(value)} />;
      })}
      {hasLocation && (
        <FilterChip
          label={`${search.loc || "Valgt sted"}${search.radius ? ` (${search.radius} km)` : ""}`}
          onRemove={removeLocation}
        />
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const isNative = useIsNative();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-muted px-2.5 text-xs ${isNative ? "h-9 py-0" : "py-1"}`}
    >
      {label}
      <button
        type="button"
        onClick={() => {
          void hapticImpact("light");
          onRemove();
        }}
        className={`-m-1.5 rounded-full text-muted-foreground hover:text-foreground ${isNative ? "p-2" : "p-1.5"}`}
        aria-label={`Fjern ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
