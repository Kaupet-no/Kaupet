import { X } from "lucide-react";

import { describeAttrValue } from "@/components/active-filters";
import { FilterChip } from "@/components/filter-chip";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import type { InterpretedCriterion } from "./resolve-text-to-filters";

type Category = { slug: string; name_nb: string };

function attributeLabel(filter: CategoryFilter, value: AttributeFilterValue) {
  if (value.kind === "multiselect" || value.kind === "exclude") {
    const values = value.values.map(
      (item) => filter.options?.find((option) => option.value === item)?.label_nb ?? item,
    );
    return `${filter.label_nb}: ${value.kind === "exclude" ? "Ikke " : ""}${values.join(", ")}`;
  }
  return value.kind === "boolean"
    ? filter.label_nb
    : `${filter.label_nb}: ${describeAttrValue(filter, value)}`;
}

export function SearchInterpretation({
  criteria,
  categories,
  filters,
  onCategoryChange,
  onAttributeChange,
}: {
  criteria: InterpretedCriterion[];
  categories: Category[];
  filters: CategoryFilter[];
  onCategoryChange: (slug: string | undefined) => void;
  onAttributeChange: (key: string, value: AttributeFilterValue | undefined) => void;
}) {
  if (criteria.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Slik tolket Kaupet søket"
    >
      <span className="text-sm text-muted-foreground">Tolket som</span>
      {criteria.map((criterion) => {
        const label =
          criterion.kind === "category"
            ? (categories.find((category) => category.slug === criterion.slug)?.name_nb ??
              criterion.slug)
            : (() => {
                const filter = filters.find((candidate) => candidate.key === criterion.key);
                return filter ? attributeLabel(filter, criterion.value) : criterion.key;
              })();
        const key = criterion.kind === "category" ? "category" : `attribute:${criterion.key}`;

        return (
          <FilterChip
            key={key}
            label={label}
            active
            hideChevron
            icon={<X className="size-3.5" aria-hidden="true" />}
            aria-label={`Fjern ${label} fra søket`}
            data-source={criterion.source}
            onClick={() =>
              criterion.kind === "category"
                ? onCategoryChange(undefined)
                : onAttributeChange(criterion.key, undefined)
            }
          />
        );
      })}
    </div>
  );
}
