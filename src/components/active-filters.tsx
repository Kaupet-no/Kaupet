import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { TermGroupChips } from "@/components/term-group-editor";
import type { TermGroup } from "@/lib/term-groups";

type SearchLike = {
  q: string;
  qMode: "all" | "any";
  extraGroups: TermGroup[];
};

type Props = {
  search: SearchLike;
  terms: string[];
  onUpdate: (patch: Partial<SearchLike>) => void;
};

// Category, price, condition and location now have their own always-visible
// filter pills (DesktopFilterChips / NativeFilterChips) that show their own
// active state directly, so this component only needs to surface what those
// pills can't express compactly: free-text search terms and extra search
// lines. Showing them again here would just duplicate the pills.
export function ActiveFilters({ search, terms, onUpdate }: Props) {
  const hasLine1 = terms.length > 0;
  const hasAnyFilter = hasLine1 || search.extraGroups.length > 0;

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
      {itemCount > 1 && (
        <button
          type="button"
          onClick={() => onUpdate({ q: "", extraGroups: [] })}
          className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Nullstill alle
        </button>
      )}
    </div>
  );
}
