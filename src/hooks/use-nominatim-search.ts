import { useCallback, useEffect, useRef, useState } from "react";

export type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

/**
 * Explicit Nominatim search. The public service forbids client-side
 * autocomplete, so callers must invoke `search` from a submit action.
 */
export function useNominatimSearch(opts?: { minLength?: number; limit?: number }): {
  results: NominatimResult[];
  loading: boolean;
  searchedQuery: string | null;
  search: (query: string) => Promise<void>;
  clear: () => void;
} {
  const minLength = opts?.minLength ?? 2;
  const limit = opts?.limit ?? 6;
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setResults([]);
    setLoading(false);
    setSearchedQuery(null);
  }, []);

  const search = useCallback(
    async (query: string) => {
      const normalized = query.trim();
      if (normalized.length < minLength) {
        clear();
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setSearchedQuery(normalized);

      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", normalized);
        url.searchParams.set("format", "json");
        url.searchParams.set("countrycodes", "no");
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("addressdetails", "0");
        const response = await fetch(url.toString(), {
          headers: { "Accept-Language": "nb" },
          signal: controller.signal,
        });
        setResults(response.ok ? await response.json() : []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [clear, limit, minLength],
  );

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { results, loading, searchedQuery, search, clear };
}
