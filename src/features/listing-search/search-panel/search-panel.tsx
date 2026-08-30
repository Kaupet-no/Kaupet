import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { Drawer } from "vaul";
import { useNavigate } from "@tanstack/react-router";
import {
  Clock,
  FolderOpen,
  RotateCcw,
  Save,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { Input } from "@/components/ui/input";
import { SaveSearchDialog } from "@/components/advanced-search-sheet";
import {
  defaultAdvancedSearchValue,
  valueToCriteria,
  type AdvancedSearchValue,
} from "@/components/advanced-search-value";
import { findCategorySuggestion, type Category } from "@/lib/categories";
import type { LocationValue } from "@/components/location-filter";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import { hapticImpact } from "@/lib/haptics";
import type { AppliedSearchState } from "@/features/listing-search/search-schema";
import { resolveAppliedSearch, submitSearch } from "@/features/listing-search/submit-search";
import {
  useSearchSuggestions,
  type ListingSuggestion,
} from "@/features/listing-search/use-search-suggestions";
import { buildStructuredSearchSuggestions } from "@/features/listing-search/structured-search-suggestions";
import { summarizeCriteria } from "@/lib/saved-searches";
import { useAuth } from "@/hooks/use-auth";
import { useFormFactor } from "@/hooks/use-form-factor";
import { useOverlayHistory } from "@/hooks/use-overlay-history";
import { useSheetDragGate } from "@/hooks/use-sheet-drag-gate";
import { useAllVehicleBrands } from "@/lib/vehicle/vehicle-brands";
import { SearchFilterSections, type SearchFilterSection } from "./filter-sections";
import { getSearchHistory, saveSearchToHistory, clearSearchHistory } from "./search-history";
import { SearchSuggestionList, type SearchSuggestionGroup } from "../search-suggestion-list";
import { buildActiveFilterItems } from "./active-filter-items";
import { trackProductEvent } from "@/lib/product-analytics";
import { expandSheetBeforeScroll } from "@/lib/sheet-gestures";
import { useDraftResultCount } from "@/features/listing-search/use-draft-result-count";
import { searchDraftMatchesApplied } from "./search-panel-utils";
import type { InterpretedCriterion } from "@/features/listing-search/resolve-text-to-filters";

export type SearchPanelSection = SearchFilterSection | "query";

/** Panelet har to detents: delvis høyde (resultatlisten er fortsatt synlig
 * bak) og fullskjerm. Brukeren drar mellom dem. */
const SNAP_POINTS = [0.6, 1];

/** Applied fields supplied by the result page. SearchPanel owns a local draft
 * while open and calls `onApply` once, so closing the panel never leaves a
 * half-applied search behind. */
export type SearchPanelResultsContext = {
  applied: AppliedSearchState;
  onApply: (applied: AppliedSearchState, criteria?: InterpretedCriterion[]) => void;
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
    attributes: { ...value.attributes },
  };
}

function cloneSearchState(applied: AppliedSearchState): AppliedSearchState {
  return { value: cloneValue(applied.value), attributes: { ...applied.attributes } };
}

function createLaunchState(location?: LocationValue): AppliedSearchState {
  const value = defaultAdvancedSearchValue();
  return {
    value: { ...value, location: location ?? value.location },
    attributes: {},
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  allFilters: CategoryFilter[];
  /** Fanen panelet åpner på — lar sammendrag-pillen hoppe rett til Pris/Sted. */
  initialSection?: SearchPanelSection;
  results?: SearchPanelResultsContext;
  savedLocation?: LocationValue;
  onSavedLocationChange?: (location: LocationValue) => void;
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
  initialSection = "query",
  results,
  savedLocation,
  onSavedLocationChange,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: vehicleBrands } = useAllVehicleBrands();
  const [launchQueryDraft, setLaunchQueryDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [section, setSection] = useState<SearchPanelSection>(initialSection);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const [draft, setDraft] = useState<AppliedSearchState>(() =>
    results ? cloneSearchState(results.applied) : createLaunchState(savedLocation),
  );
  const setDraftValue = (next: SetStateAction<AdvancedSearchValue>) =>
    setDraft((previous) => {
      const value = typeof next === "function" ? next(previous.value) : next;
      if (!results) onSavedLocationChange?.(value.location);
      return { ...previous, value };
    });
  const formFactor = useFormFactor();
  // Web og native nettbrett får dialog; native telefon får dratt skuff.
  const isWeb = formFactor === "web" || formFactor === "desktop" || formFactor === "tablet";
  const isTablet = formFactor === "tablet";
  const inputRef = useRef<HTMLInputElement>(null);
  const close = (reason: "cancel" | "apply" = "cancel") => {
    if (reason === "cancel") handleOpenChange(false);
    else onOpenChange(false);
  };
  const dragGate = useSheetDragGate({
    activeSnapPoint: snap,
    initialSnapPoint: SNAP_POINTS[0],
    setActiveSnapPoint: setSnap,
    onClose: close,
  });

  // Android-tilbake og iOS-kantsveip lukker panelet (fase 3).
  useOverlayHistory(isWeb ? false : open, () => handleOpenChange(false));

  useEffect(() => {
    if (!open) return;
    setLaunchQueryDraft(results ? results.applied.value.terms.join(" ") : "");
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
  const queryMode = section === "query";
  const { data: listingSuggestions = [] } = useSearchSuggestions(queryMode ? launchQueryDraft : "");
  const structuredSuggestions = useMemo(
    () =>
      buildStructuredSearchSuggestions(
        launchQueryDraft,
        results?.attributeFilters ?? allFilters,
        draft.attributes,
      ),
    [allFilters, draft.attributes, launchQueryDraft, results?.attributeFilters],
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
  const hasDraftCriteria =
    draftItems.length > 0 ||
    Object.keys(draft.attributes).length > 0 ||
    draft.value.categories.length > 0 ||
    draft.value.conditions.length > 0 ||
    draft.value.min != null ||
    draft.value.max != null ||
    !draft.value.includeFree ||
    draft.value.location.lat != null ||
    draft.value.location.lng != null;

  const draftCriteria = { ...valueToCriteria(draft.value), attributes: draft.attributes };
  const visibleResultCount =
    results && searchDraftMatchesApplied(draft, results.applied) ? results.resultCount : undefined;
  const draftChanged = !!results && !searchDraftMatchesApplied(draft, results.applied);
  const draftCount = useDraftResultCount({
    draft,
    categories,
    enabled: open && draftChanged,
  });
  const buttonResultCount = draftChanged
    ? (draftCount.count ?? results?.resultCount)
    : visibleResultCount;
  const launchFilterMode = !results && section === "location";

  const applyLaunchFilters = async () => {
    if (submitting) return;
    void hapticImpact("medium");
    setSubmitting(true);
    await submitSearch({
      applied: draft,
      categories,
      vehicleBrands: vehicleBrands ?? [],
      allFilters,
      commit: (search) => navigate({ to: "/annonser", search }),
    });
    setSubmitting(false);
    close("apply");
  };
  function handleOpenChange(next: boolean) {
    if (!next && results && draftChanged) {
      trackProductEvent("search_filter_cancelled", { changed: true, section });
    }
    onOpenChange(next);
  }

  const submitText = async (value: string) => {
    const trimmed = value.trim();
    if (submitting) return;
    trackProductEvent("search_submitted", {
      source: "panel_text",
      hasText: trimmed.length > 0,
    });
    void hapticImpact("medium");
    saveSearchToHistory(trimmed);

    setSubmitting(true);
    if (results) {
      const resolved = await resolveAppliedSearch({
        applied: draft,
        query: trimmed,
        categories,
        vehicleBrands: vehicleBrands ?? [],
        allFilters,
      });
      results.onApply(resolved.applied, resolved.criteria);
      setSubmitting(false);
      close("apply");
      return;
    }

    await submitSearch({
      query: trimmed,
      applied: draft,
      categories,
      vehicleBrands: vehicleBrands ?? [],
      allFilters,
      commit: (search) => navigate({ to: "/annonser", search }),
    });
    setSubmitting(false);
    close();
  };

  const goToCategory = (cat: Category) => {
    trackProductEvent("search_suggestion_selected", {
      suggestionType: "category",
      position: 1,
    });
    void hapticImpact("medium");
    if (results) {
      setDraft((previous) => ({
        ...previous,
        value: { ...previous.value, categories: [cat.slug] },
      }));
      setLaunchQueryDraft((previous) => previous.trim());
      return;
    }
    navigate({ to: "/annonser", search: { q: "", category: cat.slug, sort: "new" } });
    close("apply");
  };
  const applyStructuredSuggestion = (
    suggestion: ReturnType<typeof buildStructuredSearchSuggestions>[number],
  ) => {
    const current = draft.attributes[suggestion.filterKey];
    const value =
      current?.kind === "multiselect" && suggestion.value.kind === "multiselect"
        ? {
            kind: "multiselect" as const,
            values: [...new Set([...current.values, ...suggestion.value.values])],
          }
        : suggestion.value;
    updateDraftAttribute(suggestion.filterKey, value);
    const escaped = suggestion.matchedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    setLaunchQueryDraft((previous) =>
      previous.replace(new RegExp(`\\b${escaped}\\b`, "i"), " ").trim(),
    );
  };

  const queryContent = (
    <QueryBrowseContent
      q={launchQueryDraft}
      history={history}
      categories={categories}
      categorySuggestion={categorySuggestion}
      filterSuggestions={structuredSuggestions}
      listingSuggestions={listingSuggestions}
      onSubmit={() => void submitText(launchQueryDraft)}
      onPickHistory={(item) => void submitText(item)}
      onPickCategory={goToCategory}
      onPickFilter={applyStructuredSuggestion}
      onPickListing={() => onOpenChange(false)}
      onClearHistory={() => {
        clearSearchHistory();
        setHistory([]);
      }}
    />
  );

  const panelContent = (
    <>
      {/* Fritekstfeltet brukes i launch-modus. Et stedspanel viser bare
          lokasjonskontrollen, slik at triggeren åpner riktig oppgave. */}
      {results && !queryMode ? (
        hasDraftCriteria && (
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
                className="native-touch-target flex shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Nullstill
              </button>
            )}
          </div>
        )
      ) : !launchFilterMode ? (
        <div className="flex items-center gap-2 px-4 pb-3 pt-3">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="search"
              value={launchQueryDraft}
              onChange={(e) => setLaunchQueryDraft(e.target.value)}
              onFocus={() => setSnap(1)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitText(launchQueryDraft);
              }}
              placeholder="Søk etter merke, type, sted eller pris"
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
              className="native-touch-target shrink-0 px-2 text-sm font-medium text-primary disabled:opacity-50"
            >
              {submitting ? "Søker…" : "Søk"}
            </button>
          )}
        </div>
      ) : null}

      {categorySuggestion && !launchFilterMode && !queryMode && (
        <button
          type="button"
          onClick={() => goToCategory(categorySuggestion)}
          className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-left transition native:active:scale-[0.98]"
        >
          <FolderOpen className="size-4 shrink-0 text-primary" />
          <span className="text-sm">
            Gå til kategori:{" "}
            <span className="font-semibold text-primary">{categorySuggestion.name_nb}</span>
          </span>
        </button>
      )}

      {queryMode ? (
        queryContent
      ) : results || launchFilterMode ? (
        <SearchFilterSections
          key={`${open}-${section}`}
          value={draft.value}
          categories={categories}
          setValue={setDraftValue}
          section={section}
          queryText={draft.value.terms.join(" ")}
          attributeFilters={results?.attributeFilters ?? allFilters}
          attributeValues={draft.attributes}
          onAttributeChange={updateDraftAttribute}
          attributeCounts={results?.attributeCounts}
          activeItems={results ? draftItems : undefined}
          includePrimary={!!results}
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

      {(results || launchFilterMode) && (
        <div className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            data-testid="search-filter-apply-button"
            size="lg"
            onClick={() => {
              if (results) {
                trackProductEvent("search_filter_applied", {
                  section,
                  filterCount: draftItems.length,
                  resultCount: buttonResultCount ?? null,
                });
                results.onApply(draft);
                trackProductEvent("search_submitted", {
                  hasCategory: draft.value.categories.length > 0,
                  filterCount: draftItems.length,
                });
                close("apply");
              } else {
                void applyLaunchFilters();
              }
            }}
            className="h-14 w-full gap-2 rounded-xl text-base"
          >
            <SearchIcon className="size-4" />
            {results && buttonResultCount != null
              ? buttonResultCount === 1
                ? "Vis 1 annonse"
                : `Vis ${buttonResultCount.toLocaleString("nb-NO")} annonser`
              : submitting
                ? "Søker…"
                : "Vis annonser"}
          </Button>
          {results && draftChanged && draftCount.isPending && (
            <div
              className="pt-2 text-center text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Beregner nytt antall treff …
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {isWeb ? (
        <ResponsiveOverlay open={open} onOpenChange={handleOpenChange}>
          <ResponsiveOverlayContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Søk og filtrer</DialogTitle>
            </DialogHeader>
            {panelContent}
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      ) : (
        <Drawer.Root
          open={open}
          onOpenChange={handleOpenChange}
          snapPoints={dragGate.snapPoints}
          activeSnapPoint={snap}
          setActiveSnapPoint={dragGate.setGatedSnapPoint}
          snapToSequentialPoint
        >
          <Drawer.Portal>
            <Drawer.Overlay
              className="fixed inset-0 z-[9998] bg-black/40"
              onClick={() => close()}
            />
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
              <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                style={{ maxHeight: "calc(97dvh - var(--snap-point-height, 0px))" }}
                onScrollCapture={(event) =>
                  expandSheetBeforeScroll(event.target as HTMLElement, snap === 1, () => setSnap(1))
                }
              >
                {panelContent}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}

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

/** Forslag og historikk i query-modus. */
function QueryBrowseContent({
  q,
  history,
  categories,
  categorySuggestion,
  filterSuggestions,
  listingSuggestions,
  onSubmit,
  onPickHistory,
  onPickCategory,
  onPickFilter,
  onPickListing,
  onClearHistory,
}: {
  q: string;
  history: string[];
  categories: Category[];
  categorySuggestion: Category | null;
  filterSuggestions: ReturnType<typeof buildStructuredSearchSuggestions>;
  listingSuggestions: ListingSuggestion[];
  onSubmit: () => void;
  onPickHistory: (item: string) => void;
  onPickCategory: (category: Category) => void;
  onPickFilter: (suggestion: ReturnType<typeof buildStructuredSearchSuggestions>[number]) => void;
  onPickListing: (position: number) => void;
  onClearHistory: () => void;
}) {
  if (!q.trim()) {
    return (
      <BrowseContent
        q={q}
        history={history}
        categories={categories}
        onPickHistory={onPickHistory}
        onClearHistory={onClearHistory}
        onPickCategory={onPickCategory}
      />
    );
  }

  const groups: SearchSuggestionGroup[] = [
    {
      label: "Søk etter",
      items: [
        {
          id: "query",
          label: `Søk etter «${q.trim()}»`,
          icon: <SearchIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />,
          onSelect: onSubmit,
        },
      ],
    },
    ...(categorySuggestion
      ? [
          {
            label: "Kategori",
            items: [
              {
                id: `category:${categorySuggestion.id}`,
                label: `Gå til ${categorySuggestion.name_nb}`,
                icon: <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden="true" />,
                onSelect: () => onPickCategory(categorySuggestion),
              },
            ],
          },
        ]
      : []),
    ...(filterSuggestions.length > 0
      ? [
          {
            label: "Filter",
            items: filterSuggestions.map((suggestion) => ({
              id: suggestion.id,
              label: suggestion.label,
              icon: (
                <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ),
              onSelect: () => onPickFilter(suggestion),
            })),
          },
        ]
      : []),
    ...(listingSuggestions.length > 0
      ? [
          {
            label: "Annonser",
            items: listingSuggestions.map((suggestion, index) => ({
              id: suggestion.id,
              label: suggestion.title,
              icon: (
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ),
              kaupetCode: suggestion.kaupet_code,
              onSelect: () => {
                trackProductEvent("search_suggestion_selected", {
                  suggestionType: "listing",
                  position: index + 1,
                });
                onPickListing(index + 1);
              },
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SearchSuggestionList groups={groups} variant="inline" />
    </div>
  );
}

/** Historikk og kategoriliste når panelet ikke viser resultater. */
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
