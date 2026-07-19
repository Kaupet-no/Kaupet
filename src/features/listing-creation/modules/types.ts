import type { ComponentType } from "react";

import type { AttributeMap } from "@/components/attribute-fields";
import type { CategoryNode } from "@/lib/category-filters";

export type CategoryModuleProps = {
  categoryId: string | null;
  categories: CategoryNode[];
  value: AttributeMap;
  onChange: (next: AttributeMap) => void;
  /** Whether to show "required" errors for empty fields (generic-attributes only). */
  showErrors?: boolean;
  /** Filter keys to skip rendering (generic-attributes only) — see
   * AttributeFields' `hiddenKeys` for why. */
  hiddenKeys?: readonly string[];
};

export type CategoryModule = {
  key: string;
  Component: ComponentType<CategoryModuleProps>;
  /** Render order within the category-details step; lower renders first. */
  order: number;
  /** Extra validation beyond category_filters' required-field check (client + server). */
  validateExtra?: (attributes: AttributeMap) => string | null;
};
