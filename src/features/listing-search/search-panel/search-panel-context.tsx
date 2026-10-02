import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSavedLocation } from "@/hooks/use-saved-location";
import type { LocationValue } from "@/components/location-filter";
import type { SearchPanelResultsContext, SearchPanelSection } from "./search-panel";

const SearchPanelLoader = lazy(() =>
  import("./search-panel-loader").then((module) => ({ default: module.SearchPanelLoader })),
);

type Ctx = {
  open: boolean;
  /** Åpner det globale panelet uten å navigere eller anvende et utkast. */
  /** `attributeKey` åpner ett bestemt kategorifilter, f.eks. fra brikkeraden. */
  openPanel: (section?: SearchPanelSection, queryDraft?: string, attributeKey?: string) => void;
  /** Starter et nytt søk: åpner fritekstpanelet uten sidens resultatkontekst,
   * slik at et søk fra bunnmenyen aldri redigerer søket som allerede vises. */
  startSearch: () => void;
  closePanel: () => void;
  registerResults: (ctx: SearchPanelResultsContext | null) => void;
  savedLocation: LocationValue;
  setSavedLocation: (location: LocationValue) => void;
};

const SearchPanelCtx = createContext<Ctx | null>(null);

/**
 * Ett globalt montert søkepanel (fase 12) i stedet for et separat panel per
 * side (fase 9) — bunnavigasjonens «Søk»-fane har ingen egen sideinstans å
 * åpne, så panelet må leve over rutene, i `__root.tsx`.
 */
export function SearchPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [panelRequested, setPanelRequested] = useState(false);
  const [section, setSection] = useState<SearchPanelSection>("query");
  const [queryDraft, setQueryDraft] = useState<string>();
  const [attributeKey, setAttributeKey] = useState<string>();
  const [results, setResults] = useState<SearchPanelResultsContext | null>(null);
  const [fresh, setFresh] = useState(false);
  const [savedLocation, setSavedLocation] = useSavedLocation();

  // Kategori- og filterdata lastes først når brukeren faktisk åpner panelet.

  const openPanel = useCallback((s: SearchPanelSection = "query", q?: string, key?: string) => {
    setSection(s);
    setQueryDraft(q);
    setAttributeKey(key);
    setFresh(false);
    setPanelRequested(true);
    setOpen(true);
  }, []);
  const startSearch = useCallback(() => {
    setSection("query");
    setQueryDraft(undefined);
    setAttributeKey(undefined);
    setFresh(true);
    setPanelRequested(true);
    setOpen(true);
  }, []);
  const closePanel = useCallback(() => setOpen(false), []);
  const registerResults = useCallback((ctx: SearchPanelResultsContext | null) => {
    setResults(ctx);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      open,
      openPanel,
      startSearch,
      closePanel,
      registerResults,
      savedLocation,
      setSavedLocation,
    }),
    [open, openPanel, startSearch, closePanel, registerResults, savedLocation, setSavedLocation],
  );

  return (
    <SearchPanelCtx.Provider value={value}>
      {children}
      {panelRequested && (
        <Suspense fallback={null}>
          <SearchPanelLoader
            open={open}
            onOpenChange={setOpen}
            initialSection={section}
            initialQuery={queryDraft}
            initialAttributeKey={attributeKey}
            results={fresh ? undefined : (results ?? undefined)}
            savedLocation={savedLocation}
            onSavedLocationChange={setSavedLocation}
          />
        </Suspense>
      )}
    </SearchPanelCtx.Provider>
  );
}

export function useSearchPanel(): Ctx {
  const ctx = useContext(SearchPanelCtx);
  if (!ctx) throw new Error("useSearchPanel must be used within a SearchPanelProvider");
  return ctx;
}

/**
 * Registrerer denne sidens resultatkontekst i det globale panelet mens siden
 * er montert, og fjerner den ved unmount/rutebytte. `null` (ingen kategori
 * osv. klar ennå) er en gyldig verdi — panelet faller da tilbake til
 * lanseringsmodus (fritekst + historikk + kategoribla) helt til konteksten
 * er klar.
 */
export function useRegisterSearchPanelResults(ctx: SearchPanelResultsContext | null) {
  const { registerResults } = useSearchPanel();
  useEffect(() => {
    registerResults(ctx);
    return () => registerResults(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);
}
