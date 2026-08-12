import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

type Props = {
  /** Fritekst i det gjeldende søket. */
  q: string;
  onQChange: (q: string) => void;
  onSubmitQ: () => void;
  /** Antall aktive filtre utenom fritekst — se `countActiveFilters`. */
  filterCount: number;
  onOpen: () => void;
};

/**
 * Kompakt søkesammendrag på native resultatflater (fase 9, tiltak 26).
 * Erstatter søkelinjen + den fulle chip-raden — den både **viser** hva som er
 * aktivt (ellers byttes trangt UI mot skjult tilstand, jf. 8.3) og er
 * inngangen til søkepanelet. Fritekstdelen er et ekte inndatafelt (ikke bare
 * en trigger for panelet) — filterikonet er den separate inngangen til panelet.
 */
export function SearchSummaryPill({ q, onQChange, onSubmitQ, filterCount, onOpen }: Props) {
  const filterText = `${filterCount} ${filterCount === 1 ? "filter" : "filtre"}`;
  return (
    <div className="flex min-h-11 w-full items-center gap-2.5 rounded-full border border-border bg-card px-4 shadow-sm">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => onQChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmitQ();
        }}
        onBlur={onSubmitQ}
        placeholder="Søk i annonser"
        aria-label="Søk i annonser"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => {
          void hapticImpact("light");
          onOpen();
        }}
        aria-label={filterCount > 0 ? `Filtrer, ${filterText} aktive` : "Filtrer"}
        className="native-touch-target -mr-2 flex shrink-0 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-muted-foreground transition active:scale-[0.9]"
      >
        {filterCount > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <SlidersHorizontal className="size-3" />
            {filterText}
          </span>
        ) : (
          <SlidersHorizontal className="size-4" />
        )}
      </button>
    </div>
  );
}

/**
 * Teller aktive søkeparametere utenom fritekst, altså nøyaktig det pillen
 * oppsummerer. Kategori teller som ett filter uansett hvor mange som er valgt,
 * fordi hero-raden over pillen allerede viser kategorivalget.
 */
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
