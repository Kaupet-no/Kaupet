import { VEHICLE_EQUIPMENT_FILTER_KEYS, type CategoryFilter } from "@/lib/category-filters";

export const EQUIPMENT_GROUP_LABEL = "Utstyr";
const EQUIPMENT_KEYS = new Set<string>(VEHICLE_EQUIPMENT_FILTER_KEYS);
/** Flere alternativer enn dette får egen underside i stedet for brikker. */
const MAX_INLINE_OPTIONS = 5;

export type FilterRow =
  | { kind: "inline"; filter: CategoryFilter }
  | { kind: "row"; id: string; label: string; filters: CategoryFilter[] };

function isInlineChoice(filter: CategoryFilter): boolean {
  if (filter.type === "boolean") return true;
  if (filter.key === "brand") return false;
  if (filter.type !== "select" && filter.type !== "multiselect") return false;
  const count = filter.options?.length ?? 0;
  return count >= 2 && count <= MAX_INLINE_OPTIONS;
}

/** Korte valg vises som brikker rett i listen, resten som rader med egen
 * underside. Kjøretøyets utstyrsgrupper samles i én «Utstyr»-rad der den
 * første av dem står — seks separate rader gjorde bil til den eneste
 * kategorien der listen føltes lang. */
export function groupFilterRows(filters: CategoryFilter[]): FilterRow[] {
  const equipment = filters.filter((filter) => EQUIPMENT_KEYS.has(filter.key));
  const rows: FilterRow[] = [];
  for (const filter of filters) {
    if (equipment.length > 1 && EQUIPMENT_KEYS.has(filter.key)) {
      if (filter === equipment[0]) {
        rows.push({
          kind: "row",
          id: "equipment",
          label: EQUIPMENT_GROUP_LABEL,
          filters: equipment,
        });
      }
      continue;
    }
    rows.push(
      isInlineChoice(filter)
        ? { kind: "inline", filter }
        : { kind: "row", id: filter.id, label: filter.label_nb, filters: [filter] },
    );
  }
  return rows;
}
