import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

type Props = {
  /** Fritekst i det gjeldende søket. */
  q: string;
  /** Antall aktive filtre utenom fritekst. */
  filterCount: number;
  onOpenQuery: () => void;
  onOpenFilters: () => void;
};

/** Kompakt native oppsummering med separate query- og filterhandlinger. */
export function SearchSummaryPill({ q, filterCount, onOpenQuery, onOpenFilters }: Props) {
  const filterText = `${filterCount} ${filterCount === 1 ? "filter" : "filtre"}`;
  return (
    <div className="flex min-h-12 w-full items-center rounded-full border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => {
          void hapticImpact("light");
          onOpenQuery();
        }}
        className="native-touch-target flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span
          className={`min-w-0 truncate ${q.trim() ? "text-foreground" : "text-muted-foreground"}`}
        >
          {q.trim() || "Søk i annonser"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          void hapticImpact("light");
          onOpenFilters();
        }}
        aria-label={filterCount > 0 ? `Filtrer, ${filterText} aktive` : "Filtrer"}
        className="native-touch-target mr-1 flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {filterCount > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <SlidersHorizontal className="size-3" aria-hidden="true" />
            {filterText}
          </span>
        ) : (
          <SlidersHorizontal className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/** Teller aktive søkeparametere utenom fritekst. */
export function countActiveFilters(params: {
  min?: number;
  max?: number;
  includeFree?: boolean;
  conditions?: string[];
  hasLocation: boolean;
  attrCount: number;
  extraGroupCount: number;
  qModeAny: boolean;
}): number {
  const { min, max, includeFree, conditions, hasLocation, attrCount, extraGroupCount, qModeAny } =
    params;
  return (
    (min != null || max != null || includeFree === false ? 1 : 0) +
    ((conditions?.length ?? 0) > 0 ? 1 : 0) +
    (hasLocation ? 1 : 0) +
    attrCount +
    extraGroupCount +
    (qModeAny ? 1 : 0)
  );
}
