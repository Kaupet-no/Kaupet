import { describeAttrValue } from "@/components/active-filters";
import type { LocationValue } from "@/components/location-filter";
import type { TermGroup } from "@/lib/term-groups";
import {
  PART_FITMENT_VEHICLE_IDS_KEY,
  type AttributeFilterValue,
  type CategoryFilter,
} from "@/lib/category-filters";

type SearchLike = {
  q: string;
  qMode: "all" | "any";
  extraGroups: TermGroup[];
};

/** One removable row in the search panel's active-filter list — a flatter,
 * per-value shape than `ActiveFilters`' grouped chips (each swipe removes
 * exactly one thing), built from the same source data and the same
 * `describeAttrValue` labels so the panel and the desktop chip row never
 * disagree on what a filter is called. */
export type ActiveFilterItem = { key: string; label: string; onRemove: () => void };

export function buildActiveFilterItems(params: {
  search: SearchLike;
  terms: string[];
  onUpdate: (patch: Partial<SearchLike>) => void;
  attrFilters?: CategoryFilter[];
  attrValues?: Record<string, AttributeFilterValue>;
  onRemoveAttr?: (key: string, value?: string) => void;
  location?: LocationValue;
  onRemoveLocation?: () => void;
}): ActiveFilterItem[] {
  const {
    search,
    terms,
    onUpdate,
    attrFilters = [],
    attrValues = {},
    onRemoveAttr,
    location,
    onRemoveLocation,
  } = params;

  const items: ActiveFilterItem[] = [];
  const hasLocation = location?.lat != null && location?.lng != null;

  if (hasLocation && location) {
    items.push({
      key: "__location__",
      label: `${location.label || "Valgt sted"} · ${location.radius} km`,
      onRemove: () => onRemoveLocation?.(),
    });
  }

  for (const term of terms) {
    items.push({
      key: `__q__:${term}`,
      label: term,
      onRemove: () => onUpdate({ q: terms.filter((t) => t !== term).join(" ") }),
    });
  }

  for (const g of search.extraGroups) {
    for (const term of g.terms) {
      items.push({
        key: `${g.id}:${term}`,
        label: g.exclude ? `Ikke ${term}` : term,
        onRemove: () => {
          const next = search.extraGroups
            .map((group) =>
              group.id === g.id
                ? { ...group, terms: group.terms.filter((t) => t !== term) }
                : group,
            )
            .filter((group) => group.terms.length > 0);
          onUpdate({ extraGroups: next });
        },
      });
    }
  }
  for (const [key, value] of Object.entries(attrValues)) {
    const filter = attrFilters.find((f) => f.key === key);
    if (!filter) continue;
    if (value.kind === "multiselect") {
      for (const v of value.values) {
        const opt = filter.options?.find((o) => o.value === v);
        items.push({
          key: `${key}:${v}`,
          label:
            key === PART_FITMENT_VEHICLE_IDS_KEY
              ? `${filter.label_nb}: valgt bilmodell`
              : `${filter.label_nb}: ${opt?.label_nb ?? v}`,
          onRemove: () => onRemoveAttr?.(key, v),
        });
      }
      continue;
    }
    if (value.kind === "exclude") {
      for (const v of value.values) {
        const opt = filter.options?.find((o) => o.value === v);
        items.push({
          key: `${key}:!${v}`,
          label: `${filter.label_nb}: Ikke ${opt?.label_nb ?? v}`,
          onRemove: () => onRemoveAttr?.(key, v),
        });
      }
      continue;
    }
    items.push({
      key,
      label:
        value.kind === "boolean"
          ? filter.label_nb
          : `${filter.label_nb}: ${describeAttrValue(filter, value)}`,
      onRemove: () => onRemoveAttr?.(key),
    });
  }

  return items;
}
