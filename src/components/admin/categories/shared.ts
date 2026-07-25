import type { FilterOption, FilterType } from "@/lib/category-filters";

export type Category = {
  id: string;
  name_nb: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  icon: string | null;
  color: string | null;
  heading_font: string | null;
  search_examples: string[] | null;
};

// Suggested unique colors for main categories (OKLch, matching the design system).
export const MAIN_CATEGORY_COLOR_PRESETS = [
  "oklch(0.62 0.13 250)",
  "oklch(0.66 0.12 50)",
  "oklch(0.60 0.12 150)",
  "oklch(0.65 0.13 350)",
  "oklch(0.68 0.14 70)",
  "oklch(0.62 0.10 90)",
  "oklch(0.55 0.06 260)",
  "oklch(0.58 0.13 310)",
  "oklch(0.70 0.10 200)",
  "oklch(0.55 0.12 240)",
];

export const INDENT_WIDTH = 24;

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[æå]/g, "a")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function filterKeyify(s: string) {
  return slugify(s).replace(/-/g, "_");
}

export const FILTER_TYPES: FilterType[] = [
  "select",
  "multiselect",
  "number",
  "range",
  "boolean",
  "text",
];

export type EditableFilter = {
  id?: string;
  key: string;
  label_nb: string;
  type: FilterType;
  unit: string;
  options: FilterOption[];
  is_primary: boolean;
};

/**
 * The only field groups whose relative order actually affects the wizard's
 * pagination (resolveWizardPages always pins title-photos first and
 * review-publish/delivery-location last, regardless of their array
 * position) — so this is the only set the admin UI lets an admin drag.
 */
export const MIDDLE_FIELD_GROUP_KEYS = [
  "category-attributes",
  "condition",
  "price",
  "description-keywords",
];
