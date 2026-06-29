import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
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

  const [collapsed, setCollapsed] = useState(true);
  const [overflowStart, setOverflowStart] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const allItems: { key: string; node: ReactNode }[] = [];

  if (hasLine1) {
    allItems.push({
      key: "__q__",
      node: (
        <div key="__q__" className="rounded-md border border-border p-2">
          <TermGroupChips
            group={{ id: "q", mode: search.qMode, exclude: false, terms }}
            onRemoveTerm={removeLine1Term}
          />
        </div>
      ),
    });
  }
  for (const g of search.extraGroups) {
    allItems.push({
      key: g.id,
      node: (
        <div key={g.id} className="rounded-md border border-border p-2">
          <TermGroupChips group={g} onRemoveTerm={(t) => removeGroupTerm(g.id, t)} />
        </div>
      ),
    });
  }
  for (const slug of effectiveCategories) {
    const name = categories.find((c) => c.slug === slug)?.name_nb ?? slug;
    allItems.push({
      key: `cat_${slug}`,
      node: <FilterChip key={`cat_${slug}`} label={name} onRemove={() => removeCategory(slug)} />,
    });
  }
  if (priceLabel) {
    allItems.push({
      key: "__price__",
      node: <FilterChip key="__price__" label={priceLabel} onRemove={removePrice} />,
    });
  }
  if (!search.includeFree) {
    allItems.push({
      key: "__free__",
      node: <FilterChip key="__free__" label="Uten gratis annonser" onRemove={removeIncludeFree} />,
    });
  }
  for (const value of search.conditions) {
    const label = CONDITIONS.find((c) => c.value === value)?.label ?? value;
    allItems.push({
      key: `cond_${value}`,
      node: (
        <FilterChip key={`cond_${value}`} label={label} onRemove={() => removeCondition(value)} />
      ),
    });
  }
  if (hasLocation) {
    allItems.push({
      key: "__loc__",
      node: (
        <FilterChip
          key="__loc__"
          label={`${search.loc || "Valgt sted"}${search.radius ? ` (${search.radius} km)` : ""}`}
          onRemove={removeLocation}
        />
      ),
    });
  }

  const itemCount = allItems.length;

  useEffect(() => {
    setMeasuring(true);
    setCollapsed(true);
  }, [itemCount]);

  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => {
      setMeasuring(true);
      setCollapsed(true);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!measuring) return;
    const el = containerRef.current;
    if (!el) return;

    const children = Array.from(el.children) as HTMLElement[];
    const tops = children.map((c) => c.offsetTop);
    const uniqueTops = [...new Set(tops)].sort((a, b) => a - b);

    if (uniqueTops.length <= 2) {
      setOverflowStart(null);
    } else {
      const thirdRowTop = uniqueTops[2];
      const idx = tops.findIndex((t) => t >= thirdRowTop);
      setOverflowStart(idx >= 0 ? idx : null);
    }
    setMeasuring(false);
  }, [measuring]);

  if (!hasAnyFilter) return null;

  const showCollapsed = !measuring && collapsed && overflowStart !== null;
  const visibleItems = showCollapsed ? allItems.slice(0, overflowStart) : allItems;
  const hiddenCount = showCollapsed ? allItems.length - overflowStart! : 0;

  return (
    <div ref={containerRef} className="mt-3 flex flex-wrap items-center gap-2">
      {visibleItems.map((item) => item.node)}
      {showCollapsed && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs hover:bg-muted/80"
          aria-label={`Vis ${hiddenCount} flere filtre`}
        >
          +{hiddenCount}
        </button>
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
