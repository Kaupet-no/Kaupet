import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { Drawer } from "vaul";
import { useNavigate } from "@tanstack/react-router";
import { Clock, FolderOpen, RotateCcw, Save, Search as SearchIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import {
  defaultAdvancedSearchValue,
  valueToCriteria,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import { findCategorySuggestion, type Category } from "@/lib/categories";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { hapticImpact } from "@/lib/haptics";
import { useAuth } from "@/hooks/use-auth";
import { useFormFactor } from "@/hooks/use-form-factor";
import { useOverlayHistory } from "@/hooks/use-overlay-history";
import { useSheetDragGate } from "@/hooks/use-sheet-drag-gate";
import type { AppliedSearchState } from "@/features/listing-search/search-schema";
import { submitSearch } from "@/features/listing-search/submit-search";
import { summarizeCriteria } from "@/lib/saved-searches";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { SearchFilterSections, type SearchFilterSection } from "./filter-sections";
import { getSearchHistory, saveSearchToHistory, clearSearchHistory } from "./search-history";
import { buildActiveFilterItems } from "./active-filter-items";
import { trackProductEvent } from "@/lib/product-analytics";
import { expandSheetBeforeScroll } from "@/lib/sheet-gestures";
import { useDraftResultCount } from "@/features/listing-search/use-draft-result-count";
import { searchDraftMatchesApplied } from "./search-panel-utils";

/** Panelet har to detents: delvis høyde (resultatlisten er fortsatt synlig
 * bak) og fullskjerm. Brukeren drar mellom dem. */
const SNAP_POINTS = [0.6, 1];

/** Applied fields supplied by the result page. SearchPanel owns a local draft
 * while open and calls `onApply` once, so closing the panel never leaves a
 * half-applied search behind. */
export type SearchPanelResultsContext = {
  applied: AppliedSearchState;
  onApply: (applied: AppliedSearchState) => void;
  attributeFilters?: CategoryFilter[];
  attributeCounts?: Record<string, Record<string, number>>;
  resultCount?: number;
};

function cloneValue(value: AdvancedSearchValue): AdvancedSearchValue {
  return {
    ...value,
    terms: [...value.terms],
    categories: [...value.categories],
    conditions: [...value.conditions],
    extraGroups: value.extraGroups.map((group) => ({ ...group, terms: [...group.terms] })),
    location: { ...value.location },
  };
}

function cloneSearchState(applied: AppliedSearchState): AppliedSearchState {
  return { value: cloneValue(applied.value), attributes: { ...applied.attributes } };
}

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
  const [launchQueryDraft, setLaunchQueryDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [section, setSection] = useState<SearchFilterSection>(initialSection);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const [draft, setDraft] = useState<AppliedSearchState>(() =>
    results
      ? cloneSearchState(results.applied)
      : { value: defaultAdvancedSearchValue(), attributes: {} },
  );
  const setDraftValue = (next: SetStateAction<AdvancedSearchValue>) =>
    setDraft((previous) => ({
      ...previous,
      value: typeof next === "function" ? next(previous.value) : next,
    }));
  // Nettbrett: ikke en fullbredde skuff (fase 9 punkt 5 / funn 3.3.1). Bredden
  // kappes i stedet for å bytte primitiv — detent-dragingen er hele poenget med
  // panelet, og den skal virke likt i begge formater.
  const isTablet = useFormFactor() === "tablet";
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => onOpenChange(false);
  const dragGate = useSheetDragGate({
    activeSnapPoint: snap,
    initialSnapPoint: SNAP_POINTS[0],
    setActiveSnapPoint: setSnap,
    onClose: close,
  });

  // Android-tilbake og iOS-kantsveip lukker panelet (fase 3).
  useOverlayHistory(open, () => onOpenChange(false));

  useEffect(() => {
    if (!open) return;
    if (results) {
      setDraft(cloneSearchState(results.applied));
    }
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
    () =>
      launchQueryDraft.length >= 2 ? findCategorySuggestion(categories, launchQueryDraft) : null,
    [launchQueryDraft, categories],
  );

  const updateDraftAttribute = (key: string, value: AttributeFilterValue | undefined) => {
    setDraft((previous) => {
      const next = { ...previous.attributes };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...previous, attributes: next };
    });
  };

  const removeDraftAttribute = (key: string, option?: string) => {
    const current = draft.attributes[key];
    if (!option || !current || (current.kind !== "multiselect" && current.kind !== "exclude")) {
      updateDraftAttribute(key, undefined);
      return;
    }
    const values = current.values.filter((value) => value !== option);
    updateDraftAttribute(key, values.length ? { ...current, values } : undefined);
  };

  const draftItems = results
    ? buildActiveFilterItems({
        search: {
          q: draft.value.terms.join(" "),
          qMode: draft.value.qMode,
          extraGroups: draft.value.extraGroups,
        },
        terms: draft.value.terms,
        onUpdate: (patch) =>
          setDraft((previous) => ({
            ...previous,
            value: {
              ...previous.value,
              terms: patch.q == null ? previous.value.terms : patch.q.split(/\s+/).filter(Boolean),
              qMode: patch.qMode ?? previous.value.qMode,
              extraGroups: patch.extraGroups ?? previous.value.extraGroups,
            },
          })),
        attrFilters: results.attributeFilters,
        attrValues: draft.attributes,
        onRemoveAttr: removeDraftAttribute,
        location: draft.value.location,
        onRemoveLocation: () =>
          setDraft((previous) => ({
            ...previous,
            value: {
              ...previous.value,
              location: { lat: null, lng: null, radius: 10, label: "" },
            },
          })),
      })
    : [];

  const draftCriteria = valueToCriteria(draft.value);
  const visibleResultCount =
    results && searchDraftMatchesApplied(draft, results.applied) ? results.resultCount : undefined;
  const draftChanged = !!results && !searchDraftMatchesApplied(draft, results.applied);
  const draftCount = useDraftResultCount({
    draft,
    categories,
    enabled: open && draftChanged,
  });
  const buttonResultCount = draftChanged ? draftCount.count : visibleResultCount;

  const submitText = async (value: string) => {
    const trimmed = value.trim();
    if (submitting) return;
    void hapticImpact("medium");
    saveSearchToHistory(trimmed);

    setSubmitting(true);
    await submitSearch({
      query: trimmed,
      categories,
      vehicleBrands: vehicleBrands ?? [],
      allFilters,
      commit: (search) => navigate({ to: "/annonser", search }),
    });
    setSubmitting(false);
    close();
  };

  const goToCategory = (cat: Category) => {
    void hapticImpact("medium");
    if (results)
      setDraft((previous) => ({
        ...previous,
        value: { ...previous.value, categories: [cat.slug] },
      }));
    else navigate({ to: "/annonser", search: { q: "", category: cat.slug, sort: "new" } });
    close();
  };

  return (
    <>
      <Drawer.Root
        open={open}
        onOpenChange={onOpenChange}
        snapPoints={dragGate.snapPoints}
        activeSnapPoint={snap}
        setActiveSnapPoint={dragGate.setGatedSnapPoint}
        snapToSequentialPoint
        // Skal kunne dras helt ned for å lukkes (default `dismissible`), men
        // skal aldri bli STÅENDE i en posisjon under laveste snap-punkt
        // (0.6): vaul løser alltid en sluppet drag til enten et snap-punkt
        // eller helt lukket, aldri en vilkårlig hvileposisjon midt imellom —
        // så draget kan trygt gå under 50% underveis uten at panelet blir
        // hengende der.
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[9998] bg-black/40" onClick={close} />
          <Drawer.Content
            className={`fixed inset-x-0 bottom-0 z-[9999] flex h-full max-h-[97%] flex-col rounded-t-2xl border-t border-border bg-background outline-none ${
              isTablet ? "mx-auto w-full max-w-2xl border-x" : ""
            }`}
            aria-describedby={undefined}
            {...dragGate.dragCaptureProps}
          >
            <Drawer.Title className="sr-only">Søk og filtrer</Drawer.Title>
            <div
              aria-hidden
              className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
            />

            {/* vaul holder Drawer.Content i konstant full høyde (97dvh) og
                flytter HELE boksen ned med en transform for å late som bare
                gjeldende snap-brøk er synlig — resten av boksen henger da
                fysisk under skjermkanten, klippet av selve viewporten, ikke
                av en overflow-beholder. Et internt `overflow-y-auto` uten
                dette ville derfor aldri gjøre den nedre delen nåbar: å
                scrolle flytter bare INNHOLD innenfor boksens faste
                skjerm-mapping, ikke boksen selv. Denne wrapperen låser
                derfor sin egen maks-høyde til akkurat den synlige brøken
                (samme `--snap-point-height`-variabel vaul selv bruker til
                transformen), slik at "under fold" innhold faktisk havner
                inni en scrollbar region i stedet for bak skjermkanten. */}
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              style={{ maxHeight: "calc(97dvh - var(--snap-point-height, 0px))" }}
              onScrollCapture={(event) =>
                expandSheetBeforeScroll(event.target as HTMLElement, snap === 1, () => setSnap(1))
              }
            >
              {/* Fritekstfelt — kun i søkelanseringsmodus (forsiden). I
                filter-panelmodus (over /annonser) har resultatflaten sitt
                eget søkefelt allerede, så dette ville konkurrert med det. */}
              {results ? (
                (draftItems.length > 0 || user) && (
                  <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-3">
                    {user ? (
                      <button
                        type="button"
                        onClick={() => setSaveOpen(true)}
                        className="native-touch-target flex items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary hover:bg-muted"
                      >
                        <Save className="size-4" />
                        Lagre søk
                      </button>
                    ) : (
                      <span />
                    )}
                    {draftItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          void hapticImpact("light");
                          setDraft({ value: defaultAdvancedSearchValue(), attributes: {} });
                        }}
                        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <RotateCcw className="size-3.5" />
                        Nullstill
                      </button>
                    )}
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2 px-4 pb-3 pt-3">
                  <div className="relative flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={inputRef}
                      value={launchQueryDraft}
                      onChange={(e) => setLaunchQueryDraft(e.target.value)}
                      onFocus={() => setSnap(1)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitText(launchQueryDraft);
                      }}
                      placeholder="Hva leter du etter?"
                      className="h-11 border-0 bg-muted pl-9 pr-11 text-base focus-visible:ring-0"
                      aria-label="Søk i annonser"
                    />
                    {launchQueryDraft && (
                      <button
                        type="button"
                        onClick={() => setLaunchQueryDraft("")}
                        className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                        aria-label="Tøm søkefelt"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  {launchQueryDraft.trim() && (
                    <button
                      type="button"
                      onClick={() => void submitText(launchQueryDraft)}
                      disabled={submitting}
                      className="min-h-11 shrink-0 px-2 text-sm font-medium text-primary disabled:opacity-50"
                    >
                      {submitting ? "Søker…" : "Søk"}
                    </button>
                  )}
                </div>
              )}

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
                  key={`${open}-${section}`}
                  value={draft.value}
                  setValue={setDraftValue}
                  categories={categories}
                  section={section}
                  attributeFilters={results.attributeFilters}
                  attributeValues={draft.attributes}
                  onAttributeChange={updateDraftAttribute}
                  attributeCounts={results.attributeCounts}
                  activeItems={draftItems}
                  includePrimary
                />
              ) : (
                <BrowseContent
                  q={launchQueryDraft}
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
              {results && (
                <div className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <Button
                    type="button"
                    data-testid="search-filter-apply-button"
                    size="lg"
                    onClick={() => {
                      results.onApply(draft);
                      trackProductEvent("search_submitted", {
                        hasCategory: draft.value.categories.length > 0,
                        filterCount: draftItems.length,
                      });
                      close();
                    }}
                    className="h-14 w-full gap-2 rounded-xl text-base"
                  >
                    <SearchIcon className="size-4" />
                    {draftChanged && draftCount.isPending
                      ? "Beregner treff …"
                      : buttonResultCount == null
                        ? "Vis annonser"
                        : buttonResultCount === 1
                          ? "Vis 1 annonse"
                          : `Vis ${buttonResultCount.toLocaleString("nb-NO")} annonser`}
                  </Button>
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {results && (
        <SaveSearchDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          defaultName={summarizeCriteria(draftCriteria)}
          criteria={draftCriteria}
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
