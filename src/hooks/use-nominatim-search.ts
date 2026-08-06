import { useEffect, useState } from "react";
import { useDebouncedValue } from "./use-debounced-value";

export type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

/**
 * Debounced Nominatim (OpenStreetMap) forward-geocode search, shared between
 * the web location filter and the map's location search box.
 */
export function useNominatimSearch(
  query: string,
  opts?: { minLength?: number; limit?: number },
): { results: NominatimResult[]; loading: boolean } {
  const minLength = opts?.minLength ?? 2;
  const limit = opts?.limit ?? 6;
  const debounced = useDebouncedValue(query, 350);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (debounced.trim().length < minLength) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", debounced);
        url.searchParams.set("format", "json");
        url.searchParams.set("countrycodes", "no");
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("addressdetails", "0");
        const res = await fetch(url.toString(), {
          headers: { "Accept-Language": "nb" },
          signal: controller.signal,
        });
        if (res.ok) {
          setResults(await res.json());
        } else {
          setResults([]);
        }
      } catch {
        // ignore (including aborts)
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debounced, minLength, limit]);

  return { results, loading };
}
