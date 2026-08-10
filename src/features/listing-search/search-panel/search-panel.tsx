import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { useNavigate } from "@tanstack/react-router";
import { Clock, FolderOpen, RotateCcw, Save, Search as SearchIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import type { AdvancedSearchValue } from "@/components/advanced-search-value";
import type { LocationValue } from "@/components/location-filter";
import { findCategorySuggestion, type Category } from "@/lib/categories";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { hapticImpact } from "@/lib/haptics";
import { useAuth } from "@/hooks/use-auth";
import { useFormFactor } from "@/hooks/use-form-factor";
import { useOverlayHistory } from "@/hooks/use-overlay-history";
import { resolveTextToFilters } from "@/features/listing-search/resolve-text-to-filters";
import { encodeAttrFilters } from "@/features/listing-search/search-schema";
import type { SearchCriteria } from "@/lib/saved-searches";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { SearchFilterSections, type SearchFilterSection } from "./filter-sections";
import { getSearchHistory, saveSearchToHistory, clearSearchHistory } from "./search-history";
import type { ActiveFilterItem } from "./active-filter-items";

/** Panelet har to detents: delvis høyde (resultatlisten er fortsatt synlig
 * bak) og fullskjerm. Brukeren drar mellom dem. */
const SNAP_POINTS = [0.6, 1];

/** Feltene panelet redigerer når det står over en resultatflate. Utelatt på
 * forsiden, der panelet kun er en søkelansering.
 *
 * Live i stedet for utkast (fase 12): `value`/`setValue` skriver hver endring
 * rett til URL-en (se `setLiveValue` i use-annonser-search-state.ts), slik at
 * listen bak panelet — og treff-telleren i bunnbaren — oppdaterer seg mens
 * brukeren drar en slider eller sveiper bort en tagg, i stedet for først ved
 * en «Bruk søk»-commit. */
export type SearchPanelResultsContext = {
  /** Fritekst slik den står i URL-en akkurat nå — panelets fritekstfelt
   * synkroniseres mot denne når panelet åpnes. */
  q: string;
  value: AdvancedSearchValue;
  setValue: React.Dispatch<React.SetStateAction<AdvancedSearchValue>>;
  /** Skriver fritekst til URL-en. */
  onSubmitText: (q: string) => void;
  onSelectCategory: (slug: string) => void;
  location: LocationValue;
  onLocationChange: (v: LocationValue) => void;
  attributeFilters?: CategoryFilter[];
  attributeValues?: Record<string, AttributeFilterValue>;
  onAttributeChange?: (key: string, value: AttributeFilterValue | undefined) => void;
  attributeCounts?: Record<string, Record<string, number>>;
  /** Antall treff med gjeldende — levende, ikke bare anvendte — kriterier. */
  resultCount?: number;
  /** Aktive filtertagger, med swipe-for-å-fjerne i panelet (fase 12). */
  activeItems: ActiveFilterItem[];
  onResetAll: () => void;
  /** Kriteriene «Lagre»-knappen lagrer — allerede bygget av kallstedet
   * (`currentCriteria`), siden panelet ikke lenger holder et eget utkast å
   * bygge dem fra. */
  criteria: SearchCriteria;
  defaultName: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  allFilters: CategoryFilter[];
  /** Fanen panelet åpner på — lar sammendrag-pillen hoppe rett til Pris/Sted. */
  initialSection?: SearchFilterSection;
  results?: SearchPanelResultsContext;
};

/**
 * Ett dratt søkepanel med detents, montert én gang globalt
 * (`SearchPanelProvider`, fase 12) i stedet for separat per side (fase 9).
 * Bunnavigasjonens «Søk»-fane åpner dette panelet direkte istedenfor å
 * navigere til forsiden.
 *
 * Uten `results` er panelet en ren søkelansering (forsiden): fritekst,
 * historikk og kategorier, og et treff navigerer til /annonser. Med
 * `results` står det over en resultatflate og redigerer dens filtre live.
 */
export function SearchPanel({
  open,
  onOpenChange,
  categories,
  allFilters,
  initialSection = "categories",
  results,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: vehicleBrands } = useAllVehicleBrands();
  const [q, setQ] = useState(results?.q ?? "");
  const [history, setHistory] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [section, setSection] = useState<SearchFilterSection>(initialSection);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  // Nettbrett: ikke en fullbredde skuff (fase 9 punkt 5 / funn 3.3.1). Bredden
  // kappes i stedet for å bytte primitiv — detent-dragingen er hele poenget med
  // panelet, og den skal virke likt i begge formater.
  const isTablet = useFormFactor() === "tablet";
  const inputRef = useRef<HTMLInputElement>(null);

  // Android-tilbake og iOS-kantsveip lukker panelet (fase 3).
  useOverlayHistory(open, () => onOpenChange(false));

  useEffect(() => {
    if (!open) return;
    setQ(results?.q ?? "");
    setSection(initialSection);
    setSnap(SNAP_POINTS[0]);
    setHistory(getSearchHistory());
    // Uten resultatflate bak er fritekst hele poenget — fokuser feltet. Over en
    // resultatliste ville tastaturet dekket akkurat det brukeren skal se.
    if (results) return;
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSection]);

  const categorySuggestion = useMemo(
    () => (q.length >= 2 ? findCategorySuggestion(categories, q) : null),
    [q, categories],
  );

  const close = () => onOpenChange(false);

  const submitText = async (value: string) => {
    const trimmed = value.trim();
    if (submitting) return;
    void hapticImpact("medium");
    saveSearchToHistory(trimmed);

    if (results) {
      results.onSubmitText(trimmed);
      return;
    }

    setSubmitting(true);
    // Samme kategori-/merke-, utstyrssynonym- og tall+enhet-gjenkjenning som
    // desktop-pipelinen (resolve-text-to-filters.ts), slik at et native-søk
    // lander med de samme filtrene som på desktop.
    const resolved = await resolveTextToFilters({
      q: trimmed,
      categories,
      vehicleBrands: vehicleBrands ?? [],
      allFilters,
    }).catch(() => null);
    setSubmitting(false);

    navigate({
      to: "/annonser",
      search: {
        q: resolved?.q ?? trimmed,
        category: resolved?.categorySlug ?? "",
        attrs: resolved ? encodeAttrFilters(resolved.attrPatch) : "",
        sort: "new",
      },
    });
    close();
  };

  const goToCategory = (cat: Category) => {
    void hapticImpact("medium");
    if (results) results.onSelectCategory(cat.slug);
    else navigate({ to: "/annonser", search: { q: "", category: cat.slug, sort: "new" } });
    close();
  };

  return (
    <>
      <Drawer.Root
        open={open}
        onOpenChange={onOpenChange}
        snapPoints={SNAP_POINTS}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[9998] bg-black/40" />
          <Drawer.Content
            className={`fixed inset-x-0 bottom-0 z-[9999] flex h-full max-h-[97%] flex-col rounded-t-2xl border-t border-border bg-background outline-none ${
              isTablet ? "mx-auto w-full max-w-2xl border-x" : ""
            }`}
            aria-describedby={undefined}
          >
            <Drawer.Title className="sr-only">Søk og filtrer</Drawer.Title>
            <div
              aria-hidden
              className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
            />

            {/* Fritekstfelt — øverst i begge modus */}
            <div className="flex items-center gap-2 px-4 pb-3 pt-3">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setSnap(1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitText(q);
                  }}
                  placeholder="Hva leter du etter?"
                  className="h-11 border-0 bg-muted pl-9 pr-11 text-base focus-visible:ring-0"
                  aria-label="Søk i annonser"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Tøm søkefelt"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {results
                ? results.activeItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        void hapticImpact("light");
                        results.onResetAll();
                        setQ("");
                      }}
                      className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                      Nullstill
                    </button>
                  )
                : q.trim() && (
                    <button
                      type="button"
                      onClick={() => void submitText(q)}
                      disabled={submitting}
                      className="min-h-11 shrink-0 px-2 text-sm font-medium text-primary disabled:opacity-50"
                    >
                      {submitting ? "Søker…" : "Søk"}
                    </button>
                  )}
            </div>

            {categorySuggestion && (
              <button
                type="button"
                onClick={() => goToCategory(categorySuggestion)}
                className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-left transition active:scale-[0.98]"
              >
                <FolderOpen className="size-4 shrink-0 text-primary" />
                <span className="text-sm">
                  Gå til kategori:{" "}
                  <span className="font-semibold text-primary">{categorySuggestion.name_nb}</span>
                </span>
              </button>
            )}

            {results ? (
              <SearchFilterSections
                value={results.value}
                setValue={results.setValue}
                categories={categories}
                section={section}
                location={results.location}
                onLocationChange={results.onLocationChange}
                attributeFilters={results.attributeFilters}
                attributeValues={results.attributeValues}
                onAttributeChange={results.onAttributeChange}
                attributeCounts={results.attributeCounts}
                activeItems={results.activeItems}
                includePrimary
              />
            ) : (
              <BrowseContent
                q={q}
                history={history}
                categories={categories}
                onPickHistory={(item) => void submitText(item)}
                onClearHistory={() => {
                  clearSearchHistory();
                  setHistory([]);
                }}
                onPickCategory={goToCategory}
              />
            )}
          </Drawer.Content>

          {/* Egen flate, ikke inni Drawer.Content: vaul translaterer HELE
              innholdet (uansett hvor høyt det faktisk er) ned med
              (1 − detent) × vindushøyde for å vise bare den brøkdelen —
              en bunnbar inni den flate-transformerte boksen havner da fysisk
              under skjermkanten ved 0.6-detenten, uansett CSS på boksen selv
              (målt: --snap-point-height er den SKJULTE andelen, ikke den
              synlige — se node_modules/vaul useSnapPoints). Pinnet direkte
              til skjermbunnen her løser det, uavhengig av snap-punkt. */}
          {results && (
            <div
              className={`fixed inset-x-0 bottom-0 z-[10000] flex gap-2 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-500 ${
                open ? "translate-y-0" : "translate-y-full"
              } ${isTablet ? "mx-auto w-full max-w-2xl" : ""}`}
            >
              {user && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setSaveOpen(true)}
                  className="gap-2"
                >
                  <Save className="size-4" /> Lagre
                </Button>
              )}
              <Button type="button" size="lg" onClick={close} className="flex-1 gap-2">
                <SearchIcon className="size-4" />
                {results.resultCount != null ? `Vis ${results.resultCount} treff` : "Vis treff"}
              </Button>
            </div>
          )}
        </Drawer.Portal>
      </Drawer.Root>

      {results && (
        <SaveSearchDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          defaultName={results.defaultName}
          criteria={results.criteria}
          onSaved={() => setSaveOpen(false)}
        />
      )}
    </>
  );
}

/** Historikk + kategoriliste — panelets innhold når det ikke står over en
 * resultatflate. Uendret fra `NativeSearchOverlay`, som denne erstatter. */
function BrowseContent({
  q,
  history,
  categories,
  onPickHistory,
  onClearHistory,
  onPickCategory,
}: {
  q: string;
  history: string[];
  categories: Category[];
  onPickHistory: (item: string) => void;
  onClearHistory: () => void;
  onPickCategory: (cat: Category) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {!q && history.length > 0 && (
        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Nylige søk
            </p>
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Slett
            </button>
          </div>
          {history.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onPickHistory(item)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-muted active:bg-muted"
            >
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm">{item}</span>
            </button>
          ))}
        </div>
      )}

      {!q && categories.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bla etter kategori
          </p>
          {categories
            .filter((c) => c.parent_id === null)
            .map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onPickCategory(cat)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-muted active:bg-muted"
              >
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm">{cat.name_nb}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
