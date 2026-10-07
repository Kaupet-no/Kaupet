import { useCallback, useEffect, useRef, useState } from "react";
import { searchPlaces, type PlaceSearchResult } from "@/lib/geocode";

export type { PlaceSearchResult } from "@/lib/geocode";

/** Search only on submission. A request version prevents stale results after
 * a new search, clearing the field, or unmounting.
 */
export function usePlaceSearch(opts?: { minLength?: number; limit?: number }) {
  const minLength = opts?.minLength ?? 2;
  const limit = opts?.limit ?? 6;
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const versionRef = useRef(0);

  const clear = useCallback(() => {
    versionRef.current++;
    setResults([]);
    setLoading(false);
    setError(null);
    setSearchedQuery(null);
  }, []);

  const search = useCallback(
    async (query: string) => {
      const normalized = query.trim();
      if (normalized.length < minLength) {
        clear();
        return;
      }
      const version = ++versionRef.current;
      setResults([]);
      setLoading(true);
      setError(null);
      setSearchedQuery(normalized);
      try {
        const next = await searchPlaces(normalized, limit);
        if (version === versionRef.current) setResults(next);
      } catch {
        if (version === versionRef.current) setError("Kunne ikke hente steder. Prøv igjen senere.");
      } finally {
        if (version === versionRef.current) setLoading(false);
      }
    },
    [clear, limit, minLength],
  );

  useEffect(
    () => () => {
      versionRef.current++;
    },
    [],
  );
  return { results, loading, error, searchedQuery, search, clear };
}
