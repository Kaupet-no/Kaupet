import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { matchListingsForWtb } from "@/lib/wtb-listings.functions";
import type { WtbAttributeMap } from "./wtb-criteria-types";

export type WtbMatchInput = {
  categoryId: string | null;
  maxPriceNok: number | null;
  attributes: WtbAttributeMap;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
};

/** Annonser som allerede oppfyller kjøpsønsket — speilet av salgsflytens
 * «N brukere ønsker å kjøpe»-banner. Debouncet på innhold, så kriterier som
 * endres mens brukeren drar i en glidebryter ikke gir ett kall per steg. */
export function useWtbExistingMatches(input: WtbMatchInput, limit = 5) {
  const debounced = useDebouncedValue(input, 600);
  const matchFn = useServerFn(matchListingsForWtb);
  return useQuery({
    queryKey: ["wtb-existing-matches", debounced, limit],
    enabled: !!debounced.categoryId,
    staleTime: 30_000,
    queryFn: () =>
      matchFn({
        data: {
          category_id: debounced.categoryId!,
          max_price_nok: debounced.maxPriceNok,
          attributes: debounced.attributes,
          lat: debounced.lat,
          lng: debounced.lng,
          radius_km: debounced.radiusKm,
          limit,
        },
      }),
  });
}
