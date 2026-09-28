import { Search as SearchIcon, SlidersHorizontal, Waypoints, X } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

type Props = {
  /** Fritekst i det gjeldende søket. */
  q: string;
  /** Antall aktive filtre utenom fritekst. */
  filterCount: number;
  searchRuleCount?: number;
  onQChange: (q: string) => void;
  onSubmitQ: () => void;
  onOpenRules?: () => void;
  /** Utelates der brikkeraden under feltet har «Filtre»-inngangen. */
  onOpenFilters?: () => void;
  /** Kategorien søket er avgrenset til, vist som en brikke i feltet. Et
   * søkeord som ble tolket til kategori («sykkel») forsvinner da ikke
   * sporløst, og X fjerner avgrensningen. */
  categoryToken?: { label: string; onRemove: () => void };
};

/** Kompakt native søkefelt med separate regel- og filterhandlinger. */
export function SearchSummaryPill({
  q,
  filterCount,
  searchRuleCount = 0,
  onQChange,
  onSubmitQ,
  onOpenRules,
  onOpenFilters,
  categoryToken,
}: Props) {
  const filterText = `${filterCount} ${filterCount === 1 ? "filter" : "filtre"}`;
  return (
    <div className="flex min-h-12 w-full items-center rounded-full border border-border bg-card shadow-sm">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          // Lukker tastaturet så resultatene blir synlige.
          (e.currentTarget.elements.namedItem("q") as HTMLInputElement | null)?.blur();
          onSubmitQ();
        }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full pl-4 pr-2 focus-within:ring-2 focus-within:ring-ring"
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {categoryToken && (
          <span className="flex max-w-[45%] shrink-0 items-center gap-0.5 rounded-full bg-primary py-0.5 pl-2.5 text-sm font-medium text-primary-foreground">
            <span className="truncate">{categoryToken.label}</span>
            <button
              type="button"
              onClick={() => {
                void hapticImpact("light");
                categoryToken.onRemove();
              }}
              aria-label={`Fjern kategorien ${categoryToken.label}`}
              className="native-hit-area flex size-6 shrink-0 items-center justify-center rounded-full"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
        <input
          name="q"
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder={categoryToken ? `Søk i ${categoryToken.label}` : "Søk i annonser"}
          aria-label="Søk i annonser"
          className="native-touch-target min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {onOpenRules && (
        <button
          type="button"
          onClick={() => {
            void hapticImpact("light");
            onOpenRules();
          }}
          aria-label={searchRuleCount > 0 ? "Søkeregler, egne regler aktive" : "Søkeregler"}
          className={`native-touch-target flex size-12 shrink-0 items-center justify-center rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            searchRuleCount > 0
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-primary"
          }`}
        >
          <Waypoints className="size-4" aria-hidden="true" />
        </button>
      )}
      {onOpenFilters && (
        <button
          type="button"
          onClick={() => {
            void hapticImpact("light");
            onOpenFilters();
          }}
          aria-label={filterCount > 0 ? `Filtrer, ${filterText} aktive` : "Filtrer"}
          className={`native-touch-target ml-1 flex size-12 shrink-0 items-center justify-center rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            filterCount > 0
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-primary"
          }`}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
        </button>
      )}
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
