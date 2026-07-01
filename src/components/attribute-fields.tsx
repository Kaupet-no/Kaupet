import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  effectiveFiltersForCategory,
  normalizeFilter,
  type AttributeValue,
  type CategoryFilter,
  type CategoryNode,
} from "@/lib/category-filters";

export type AttributeMap = Record<string, AttributeValue>;

/** Fetches all category filters once; cached across the app. */
export function useAllCategoryFilters() {
  return useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });
}

/**
 * Renders one input per effective filter for the given category. Values are a
 * flat key->value map kept by the parent; range filters are not shown here
 * (they are search-only). `select`, `multiselect`, `number`, `boolean` and
 * `text` are supported as single-value inputs.
 */
export function AttributeFields({
  categoryId,
  categories,
  value,
  onChange,
}: {
  categoryId: string | null;
  categories: CategoryNode[];
  value: AttributeMap;
  onChange: (next: AttributeMap) => void;
}) {
  const { data: allFilters } = useAllCategoryFilters();

  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const filters = useMemo(
    () => effectiveFiltersForCategory(categoryId, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );

  if (!categoryId || filters.length === 0) return null;

  const set = (key: string, v: AttributeValue | undefined) => {
    const next = { ...value };
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete next[key];
    else next[key] = v;
    onChange(next);
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Egenskaper</p>
      {filters.map((f) => (
        <AttributeField
          key={f.id}
          filter={f}
          value={value[f.key]}
          onChange={(v) => set(f.key, v)}
        />
      ))}
    </div>
  );
}

function AttributeField({
  filter,
  value,
  onChange,
}: {
  filter: CategoryFilter;
  value: AttributeValue | undefined;
  onChange: (v: AttributeValue | undefined) => void;
}) {
  const label = filter.unit ? `${filter.label_nb} (${filter.unit})` : filter.label_nb;

  if (filter.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value === true}
          onCheckedChange={(c) => onChange(c === true ? true : undefined)}
        />
        {filter.label_nb}
      </label>
    );
  }

  if (filter.type === "select") {
    const options = filter.options ?? [];
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v || undefined)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Velg…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label_nb}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (filter.type === "multiselect") {
    const options = filter.options ?? [];
    const selected = Array.isArray(value) ? value : [];
    const toggle = (val: string) => {
      const next = selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val];
      onChange(next.length > 0 ? next : undefined);
    };
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex flex-wrap gap-3">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              {o.label_nb}
            </label>
          ))}
        </div>
      </div>
    );
  }

  // number / range (single value in input context) / text
  const isNumber = filter.type === "number" || filter.type === "range";
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={isNumber ? "number" : "text"}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(undefined);
          onChange(isNumber ? Number(raw) : raw);
        }}
      />
    </div>
  );
}
