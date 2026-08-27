import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { normalizeFilter } from "@/lib/category-filters";
import type { Category } from "@/lib/categories";
import type { SearchPanelResultsContext } from "./search-panel";
import type { SearchFilterSection } from "./filter-sections";

const SearchPanel = lazy(() =>
  import("./search-panel").then((module) => ({ default: module.SearchPanel })),
);

type Ctx = {
  open: boolean;
  /** Åpner det globale panelet. Uten en registrert resultatkontekst og uten
   * å allerede stå på /annonser, navigerer den dit først — panelet lever i
   * root og blir stående gjennom rutebyttet, og bytter selv fra
   * lanserings- til resultatmodus når /annonser registrerer seg. */
  openPanel: (section?: SearchFilterSection) => void;
  closePanel: () => void;
  registerResults: (ctx: SearchPanelResultsContext | null) => void;
};

const SearchPanelCtx = createContext<Ctx | null>(null);

/**
 * Ett globalt montert søkepanel (fase 12) i stedet for et separat panel per
 * side (fase 9) — bunnavigasjonens «Søk»-fane har ingen egen sideinstans å
 * åpne, så panelet må leve over rutene, i `__root.tsx`.
 */
export function SearchPanelProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [panelRequested, setPanelRequested] = useState(false);
  const [section, setSection] = useState<SearchFilterSection>("categories");
  const [results, setResults] = useState<SearchPanelResultsContext | null>(null);
  // Mirrors `results` for `openPanel`'s "is a page already showing results"
  // check, kept out of that callback's own dependency array — otherwise
  // `openPanel`'s identity would change every time a page re-registers (which
  // happens on essentially every re-render, since the registered object is
  // rebuilt each time), which changes the memoized context value, which
  // re-renders every consumer — including the page that just registered —
  // which rebuilds the object and registers again: an infinite loop.
  const hasResultsRef = useRef(false);

  // Samme queryKey som de tre sidene som tidligere hentet dette selv
  // (annonser.tsx, category-landing-page.tsx, app-landing.tsx) — én delt
  // cache i stedet for en fjerde uavhengig henting.
  const { data: categories } = useQuery({
    queryKey: ["categories", "with-color"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color, heading_font")
        .eq("is_hidden", false)
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: allFilters } = useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select(
          "id, category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value, depends_on_not_value, is_optional",
        )
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  const openPanel = useCallback(
    (s?: SearchFilterSection) => {
      if (s) setSection(s);
      setPanelRequested(true);
      if (!hasResultsRef.current && pathname !== "/annonser") {
        void navigate({ to: "/annonser", search: { q: "", category: "", sort: "new" } });
      }
      setOpen(true);
    },
    [pathname, navigate],
  );
  const closePanel = useCallback(() => setOpen(false), []);
  const registerResults = useCallback((ctx: SearchPanelResultsContext | null) => {
    hasResultsRef.current = ctx != null;
    setResults(ctx);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ open, openPanel, closePanel, registerResults }),
    [open, openPanel, closePanel, registerResults],
  );

  return (
    <SearchPanelCtx.Provider value={value}>
      {children}
      {panelRequested && (
        <Suspense fallback={null}>
          <SearchPanel
            open={open}
            onOpenChange={setOpen}
            categories={categories ?? []}
            allFilters={allFilters ?? []}
            initialSection={section}
            results={results ?? undefined}
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
