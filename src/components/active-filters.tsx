import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { format } from "date-fns";
import { TermGroupChips } from "@/components/term-group-editor";
import type { LocationValue } from "@/components/location-filter";
import type { TermGroup } from "@/lib/term-groups";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { parseIsoDate } from "@/lib/vehicle/vehicle-date";

type SearchLike = {
  q: string;
  qMode: "all" | "any";
  extraGroups: TermGroup[];
};

type Props = {
  search: SearchLike;
  terms: string[];
  onUpdate: (patch: Partial<SearchLike>) => void;
  /** Category-specific search parameters, shown as their own removable
   * labels alongside the free-text terms below. */
  attrFilters?: CategoryFilter[];
  attrValues?: Record<string, AttributeFilterValue>;
  onRemoveAttr?: (key: string, value?: string) => void;
  /** Composite keys ("filterKey" or "filterKey:optionValue", matching the
   * ones built below) that were just auto-applied from typed text — briefly
   * highlighted so the user sees *which* chip their word turned into,
   * instead of the word just vanishing with no visible destination. */
  justCreatedKeys?: Set<string>;
  /** Location/radius filter set via the map — shown as its own removable
   * label since it has no always-visible pill of its own (it lives inside
   * the map section, not the filter-chip row). */
  location?: LocationValue;
  onRemoveLocation?: () => void;
};

export function describeAttrValue(filter: CategoryFilter, value: AttributeFilterValue): string {
  switch (value.kind) {
    case "select": {
      const opt = filter.options?.find((o) => o.value === value.value);
      return opt?.label_nb ?? value.value;
    }
    case "boolean":
      return filter.label_nb;
    case "text":
      return value.value;
    case "range": {
      const unit = filter.unit ? ` ${filter.unit}` : "";
      if (value.min != null && value.max != null) return `${value.min}–${value.max}${unit}`;
      if (value.min != null) return `Fra ${value.min}${unit}`;
      if (value.max != null) return `Til ${value.max}${unit}`;
      return filter.label_nb;
    }
    case "date_min": {
      const d = parseIsoDate(value.value);
      return d ? `Fra ${format(d, "dd.MM.yyyy")}` : filter.label_nb;
    }
    case "multiselect":
    case "exclude":
      return "";
  }
}

// Category, price, condition and location now have their own always-visible
// filter pills (DesktopFilterChips / NativeFilterChips) that show their own
// active state directly, so free-text search terms and extra search lines
// are surfaced here since the pills can't express those compactly.
// Category-specific attribute filters (attrFilters/attrValues) *do* have a
// pill ("Egenskaper"), but its popover hides which values are active, so
// each active attribute value gets its own removable label here too.
export function ActiveFilters({
  search,
  terms,
  onUpdate,
  attrFilters = [],
  attrValues = {},
  onRemoveAttr,
  location,
  onRemoveLocation,
  justCreatedKeys,
}: Props) {
  const hasLine1 = terms.length > 0;
  const attrEntries = Object.entries(attrValues);
  const hasLocation = location?.lat != null && location?.lng != null;
  const hasAnyFilter =
    hasLine1 || search.extraGroups.length > 0 || attrEntries.length > 0 || hasLocation;

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

  if (hasLocation && location) {
    allItems.push({
      key: "__location__",
      node: (
        <AttrChip
          key="__location__"
          label={`${location.label || "Valgt sted"} · ${location.radius} km`}
          onRemove={() => onRemoveLocation?.()}
        />
      ),
    });
  }
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
  for (const [key, value] of attrEntries) {
    const filter = attrFilters.find((f) => f.key === key);
    if (!filter) continue;
    if (value.kind === "multiselect") {
      for (const v of value.values) {
        const opt = filter.options?.find((o) => o.value === v);
        allItems.push({
          key: `${key}:${v}`,
          node: (
            <AttrChip
              key={`${key}:${v}`}
              label={`${filter.label_nb}: ${opt?.label_nb ?? v}`}
              onRemove={() => onRemoveAttr?.(key, v)}
              justCreated={justCreatedKeys?.has(`${key}:${v}`)}
            />
          ),
        });
      }
      continue;
    }
    if (value.kind === "exclude") {
      for (const v of value.values) {
        const opt = filter.options?.find((o) => o.value === v);
        allItems.push({
          key: `${key}:!${v}`,
          node: (
            <AttrChip
              key={`${key}:!${v}`}
              label={`${filter.label_nb}: Ikke ${opt?.label_nb ?? v}`}
              onRemove={() => onRemoveAttr?.(key, v)}
              justCreated={justCreatedKeys?.has(`${key}:!${v}`)}
            />
          ),
        });
      }
      continue;
    }
    allItems.push({
      key,
      node: (
        <AttrChip
          key={key}
          label={
            value.kind === "boolean"
              ? filter.label_nb
              : `${filter.label_nb}: ${describeAttrValue(filter, value)}`
          }
          onRemove={() => onRemoveAttr?.(key)}
          justCreated={justCreatedKeys?.has(`${key}:`)}
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
    <div ref={containerRef} className="flex flex-wrap items-center gap-2">
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
          onClick={() => {
            onUpdate({ q: "", extraGroups: [] });
            for (const key of Object.keys(attrValues)) onRemoveAttr?.(key);
            if (hasLocation) onRemoveLocation?.();
          }}
          className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Nullstill alle
        </button>
      )}
    </div>
  );
}

function AttrChip({
  label,
  onRemove,
  justCreated,
}: {
  label: string;
  onRemove: () => void;
  justCreated?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs ${
        justCreated ? "animate-in fade-in zoom-in-95 ring-2 ring-primary/50 duration-300" : ""
      }`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="-m-1.5 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={`Fjern ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
