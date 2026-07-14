import { genericAttributesModule } from "./generic-attributes";
import type { CategoryModule } from "./types";

export type { CategoryModule, CategoryModuleProps } from "./types";

/** Vehicle lookup (Statens Vegvesen) used to be a category-attributes
 * module; it's now the dedicated vehicle-registration/vehicle-confirm field
 * groups in the vehicle-first flow (see category-flows.ts), so it no longer
 * needs a MODULE_REGISTRY entry. */
export const MODULE_REGISTRY: Record<string, CategoryModule> = {
  "generic-attributes": genericAttributesModule,
};

/** Norwegian display labels for admin UI (category flow configuration). */
export const MODULE_LABELS_NB: Record<string, string> = {
  "generic-attributes": "Kategoriegenskaper",
};

/** Resolves module keys (from a category flow) to registered modules, sorted by render order. */
export function modulesForKeys(keys: string[]): CategoryModule[] {
  return keys
    .map((key) => MODULE_REGISTRY[key])
    .filter((m): m is CategoryModule => !!m)
    .sort((a, b) => a.order - b.order);
}
