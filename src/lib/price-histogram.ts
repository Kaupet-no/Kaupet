import type { RangeBounds } from "@/lib/filter-range-bounds";

/** Antall søyler i prisfordelingen over prisslideren. */
export const PRICE_HISTOGRAM_BUCKETS = 20;

/** Deler prisene i like brede søyler over `bounds`. Priser over maks havner i
 * siste søyle, som slideren viser som «maks+». */
export function bucketPrices(
  prices: number[],
  bounds: Pick<RangeBounds, "min" | "max">,
  buckets = PRICE_HISTOGRAM_BUCKETS,
): number[] {
  const counts = Array.from({ length: buckets }, () => 0);
  const span = bounds.max - bounds.min;
  if (span <= 0) return counts;
  for (const price of prices) {
    if (price < bounds.min) continue;
    const index = Math.min(buckets - 1, Math.floor(((price - bounds.min) / span) * buckets));
    counts[index] += 1;
  }
  return counts;
}

/** Runder til et tall folk selv ville skrevet: 1 800 → 2 000, 42 300 → 40 000. */
export function roundToNicePrice(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const candidates = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].map((c) => c * magnitude);
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
  );
}

/**
 * Skalaen for fordeling og slider i skuffen: slutter ved 95. persentil i
 * stedet for dyreste annonse, så én bil til 700 000 ikke klemmer alle søylene
 * inn i første tjuendedel. Toppen av slideren betyr «og dyrere», så ingen
 * annonse faller utenfor. Et valgt maks over skalaen utvider den.
 */
export function priceScaleMax(prices: number[], boundsMax: number, selectedMax?: number | null) {
  const sorted = prices.filter((price) => price > 0).sort((a, b) => a - b);
  if (sorted.length < 8) return boundsMax;
  const p95 = roundToNicePrice(sorted[Math.floor(0.95 * (sorted.length - 1))]);
  return Math.min(boundsMax, Math.max(p95, selectedMax ?? 0));
}

export type PriceQuickRange = { label: string; min?: number; max?: number };

const kr = (n: number) => n.toLocaleString("nb-NO");

/**
 * Hurtigvalg fra prisene i søket: «Under» nedre kvartil, nedre kvartil til
 * median, og «Under» øvre kvartil — tallene brukeren faktisk velger mellom i
 * akkurat denne kategorien, ikke faste 50 000/100 000/250 000 som passer bil,
 * men ikke sykkel. Tom liste når utvalget er for lite til å si noe.
 */
export function priceQuickRanges(prices: number[]): PriceQuickRange[] {
  const sorted = prices.filter((price) => price > 0).sort((a, b) => a - b);
  if (sorted.length < 8) return [];
  const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))];
  const low = roundToNicePrice(at(0.25));
  const mid = roundToNicePrice(at(0.5));
  const high = roundToNicePrice(at(0.75));
  const ranges: PriceQuickRange[] = [{ label: `Under ${kr(low)}`, max: low }];
  if (mid > low) ranges.push({ label: `${kr(low)}–${kr(mid)}`, min: low, max: mid });
  if (high > mid) ranges.push({ label: `Under ${kr(high)}`, max: high });
  return ranges;
}
