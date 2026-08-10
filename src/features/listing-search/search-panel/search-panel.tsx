import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { useNavigate } from "@tanstack/react-router";
import { Clock, FolderOpen, RotateCcw, Save, Search as SearchIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import {
  buildAdvancedSearchCriteria,
  mergeAdvancedSearchGroups,
  resetAdvancedSearchValue,
} from "@/lib/advanced-search-actions";
import type { AdvancedSearchValue } from "@/components/advanced-search-value";
import type { LocationValue } from "@/components/location-filter";
import { findCategorySuggestion, type Category } from "@/lib/categories";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { useAuth } from "@/hooks/use-auth";
import { useAdvancedSearchValue } from "@/hooks/use-advanced-search-value";
import { useOverlayHistory } from "@/hooks/use-overlay-history";
import { resolveTextToFilters } from "@/features/listing-search/resolve-text-to-filters";
import { encodeAttrFilters } from "@/features/listing-search/search-schema";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { SearchFilterSections, type SearchFilterSection } from "./filter-sections";
import { getSearchHistory, saveSearchToHistory, clearSearchHistory } from "./search-history";

/** Panelet har to detents: delvis høyde (resultatlisten er fortsatt synlig
 * bak) og fullskjerm. Brukeren drar mellom dem. */
const SNAP_POINTS = [0.6, 1];

/** Feltene panelet redigerer når det står over en resultatflate. Utelatt på
 * forsiden, der panelet kun er en søkelansering. */
export type SearchPanelResultsContext = {
  /** Utkastverdien fanene starter fra (`advancedInitial`). */
  initial: AdvancedSearchValue;
  onApply: (v: AdvancedSearchValue) => void;
  /** Skriver fritekst til URL-en. */
  onSubmitText: (q: string) => void;
  onSelectCategory: (slug: string) => void;
  location: LocationValue;
  onLocationChange: (v: LocationValue) => void;
  attributeFilters?: CategoryFilter[];
  attributeValues?: Record<string, AttributeFilterValue>;
  onAttributeChange?: (key: string, value: AttributeFilterValue | undefined) => void;
  attributeCounts?: Record<string, Record<string, number>>;
  /** Antall treff med gjeldende (anvendte) kriterier — vises i bunnknappen. */
  resultCount?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  allFilters: CategoryFilter[];
  /** Fritekst panelet åpner med. */
  initialQ?: string;
  /** Fanen panelet åpner på — lar sammendrag-pillen hoppe rett til Pris/Sted. */
  initialSection?: SearchFilterSection;
  results?: SearchPanelResultsContext;
};

/**
 * Ett dratt søkepanel med detents (fase 9). Erstatter de to tidligere native
 * søkeflatene: `NativeSearchOverlay` (fritekst, historikk, kategoriliste) og
 * `NativeAdvancedSearch` sin bruk over resultatlistene (parameterfaner).
 *
 * Uten `results` er panelet en ren søkelansering (forsiden): fritekst,
 * historikk og kategorier, og et treff navigerer til `/annonser`. Med
 * `results` står det over en resultatflate og redigerer dens filtre i stedet.
 */
export function SearchPanel({
  open,
  onOpenChange,
  categories,
  allFilters,
  initialQ = "",
  initialSection = "categories",
  results,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: vehicleBrands } = useAllVehicleBrands();
  const [q, setQ] = useState(initialQ);
  const [history, setHistory] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [section, setSection] = useState<SearchFilterSection>(initialSection);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Utkastet for parameterfanene. Hooken nullstiller det hver gang panelet
  // åpnes, samme kontrakt som NativeAdvancedSearch hadde.
  const [v, setV] = useAdvancedSearchValue(open, results?.initial ?? EMPTY_VALUE);

  // Android-tilbake og iOS-kantsveip lukker panelet (fase 3).
  useOverlayHistory(open, () => onOpenChange(false));

  useEffect(() => {
    if (!open) return;
    setQ(initialQ);
    setSection(initialSection);
    setSnap(SNAP_POINTS[0]);
    setHistory(getSearchHistory());
    // Uten resultatflate bak er fritekst hele poenget — fokuser feltet. Over en
    // resultatliste ville tastaturet dekket akkurat det brukeren skal se.
    if (results) return;
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQ, initialSection]);

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
      close();
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

  const applyFilters = () => {
    if (!results) return;
    void hapticNotification("success");
    results.onApply(mergeAdvancedSearchGroups(v));
    if (q.trim() !== initialQ.trim()) results.onSubmitText(q.trim());
    close();
  };

  const { criteria, defaultName } = buildAdvancedSearchCriteria(v);

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
            className="fixed inset-x-0 bottom-0 z-[9999] flex h-full max-h-[97%] flex-col rounded-t-2xl border-t border-border bg-background outline-none"
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
              {results ? (
                <button
                  type="button"
                  onClick={() => {
                    void hapticImpact("light");
                    setV(resetAdvancedSearchValue(v));
                    setQ("");
                  }}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" />
                  Nullstill
                </button>
              ) : (
                q.trim() && (
                  <button
                    type="button"
                    onClick={() => void submitText(q)}
                    disabled={submitting}
                    className="min-h-11 shrink-0 px-2 text-sm font-medium text-primary disabled:opacity-50"
                  >
                    {submitting ? "Søker…" : "Søk"}
                  </button>
                )
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
              <>
                <SearchFilterSections
                  value={v}
                  setValue={setV}
                  categories={categories}
                  section={section}
                  onSectionChange={setSection}
                  location={results.location}
                  onLocationChange={results.onLocationChange}
                  attributeFilters={results.attributeFilters}
                  attributeValues={results.attributeValues}
                  onAttributeChange={results.onAttributeChange}
                  attributeCounts={results.attributeCounts}
                  includePrimary
                />
                <div className="flex gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                  <Button type="button" size="lg" onClick={applyFilters} className="flex-1 gap-2">
                    <SearchIcon className="size-4" />
                    {results.resultCount != null ? `Vis ${results.resultCount} treff` : "Vis treff"}
                  </Button>
                </div>
              </>
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
        </Drawer.Portal>
      </Drawer.Root>

      {results && (
        <SaveSearchDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          defaultName={defaultName}
          criteria={criteria}
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

/** Tomt utkast for lansering-modus, der parameterfanene ikke rendres. Ligger
 * på modulnivå så identiteten er stabil mellom renderinger. */
const EMPTY_VALUE: AdvancedSearchValue = {
  terms: [],
  qMode: "all",
  extraGroups: [],
  categories: [],
  catMode: "any",
  conditions: [],
  min: null,
  max: null,
  includeFree: true,
  sort: "new",
  location: { lat: null, lng: null, radius: 10, label: "" },
};
