import { vehicleLookupModule } from "./vehicle-lookup";
import { genericAttributesModule } from "./generic-attributes";
import type { CategoryModule } from "./types";

export type { CategoryModule, CategoryModuleProps } from "./types";

export const MODULE_REGISTRY: Record<string, CategoryModule> = {
  "vehicle-lookup": vehicleLookupModule,
  "generic-attributes": genericAttributesModule,
};

/** Norwegian display labels for admin UI (category flow configuration). */
export const MODULE_LABELS_NB: Record<string, string> = {
  "vehicle-lookup": "Kjøretøyoppslag (Statens vegvesen)",
  "generic-attributes": "Kategoriegenskaper",
};

/** Resolves module keys (from a category flow) to registered modules, sorted by render order. */
export function modulesForKeys(keys: string[]): CategoryModule[] {
  return keys
    .map((key) => MODULE_REGISTRY[key])
    .filter((m): m is CategoryModule => !!m)
    .sort((a, b) => a.order - b.order);
}
