import { computeListingTotalPriceKr } from "@/lib/vehicle/vehicle-classification";

type ListingPriceData = {
  price_nok: number | null;
  is_free: boolean;
  category_slug?: string | null;
  attributes?: Record<string, unknown> | null;
};

export function formatPrice(p: { price_nok: number | null; is_free: boolean }) {
  if (p.is_free) return "Gis bort";
  if (p.price_nok == null) return "Pris ved henvendelse";
  return `${p.price_nok.toLocaleString("nb-NO")} kr`;
}

/** Vehicle listing cards show the price including omregistreringsavgift —
 * same total as the listing detail page — not just what the seller set. */
export function displayPriceNok(
  listing: Pick<ListingPriceData, "category_slug" | "price_nok" | "attributes">,
): number | null {
  return (
    computeListingTotalPriceKr(listing.category_slug, listing.price_nok, listing.attributes) ??
    listing.price_nok
  );
}

/** Tallformatering med norske tusenskiller — `1234` → `"1 234"`. For beløp
 * som skal ha " kr" bak, bruk `formatNok`. */
export function formatNokNumber(n: number): string {
  return n.toLocaleString("nb-NO");
}

/** Makspris på en ønskes kjøpt-annonse. 0 betyr «bare gratis» i matchingen
 * (`l.is_free OR l.price_nok <= 0`), så «0 kr» ville vært misvisende. */
export function formatWtbMaxPrice(n: number): string {
  return n === 0 ? "Kun gratis" : `${formatNokNumber(n)} kr`;
}

/** Standard beløpsvisning i appen — `1234` → `"1 234 kr"`. */
export function formatNok(n: number): string {
  return `${formatNokNumber(n)} kr`;
}

/** 25.–75.-persentil av en prisliste — et dempet "typisk prisspenn"-hint
 * under prisfeltet i annonseopprettelsen, ikke en påtvunget verdi. Bruker
 * persentiler i stedet for min/maks slik at et par ekstremverdier ikke
 * dominerer spennet. Krever minst 3 datapunkter; under det er et spenn ikke
 * meningsfullt, så vi viser ingenting heller enn å gjette. */
export function priceRange(prices: number[]): { low: number; high: number } | null {
  if (prices.length < 3) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const percentile = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return { low: Math.round(percentile(0.25)), high: Math.round(percentile(0.75)) };
}

// Datoformattering (nb-NO). Én funksjon per format som faktisk vises i appen.
const NB = "nb-NO";
const dateOf = (iso: string) => new Date(iso);

/** `1.10.2026` */
export const formatDate = (iso: string) => dateOf(iso).toLocaleDateString(NB);
/** `1.10.2026, 14:05:09` */
export const formatDateTime = (iso: string) => dateOf(iso).toLocaleString(NB);
/** `1. okt. 2026, 14:05` */
export const formatDateTimeMedium = (iso: string) =>
  dateOf(iso).toLocaleString(NB, { dateStyle: "medium", timeStyle: "short" });
/** `01. oktober 2026 kl. 14:05` */
export const formatDateTimeLong = (iso: string) =>
  dateOf(iso).toLocaleString(NB, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
/** `1. okt. 2026` */
export const formatDateShort = (iso: string) =>
  dateOf(iso).toLocaleDateString(NB, { day: "numeric", month: "short", year: "numeric" });
/** `1. oktober 2026` */
export const formatDateLong = (iso: string) =>
  dateOf(iso).toLocaleDateString(NB, { day: "numeric", month: "long", year: "numeric" });
/** `01. oktober 2026` */
export const formatDateLongPadded = (iso: string) =>
  dateOf(iso).toLocaleDateString(NB, { day: "2-digit", month: "long", year: "numeric" });
/** `oktober 2026` */
export const formatMonthYear = (iso: string) =>
  dateOf(iso).toLocaleDateString(NB, { month: "long", year: "numeric" });
/** `1. okt.` */
export const formatDayMonth = (iso: string) =>
  dateOf(iso).toLocaleDateString(NB, { day: "numeric", month: "short" });

/** Initialer til avatar — første bokstav i de to første ordene («Demo user 2»
 * → «DU»). Samme regel overalt, ellers viser meny og profil ulike bokstaver. */
export function initials(name: string | null | undefined, fallback = ""): string {
  const source = (name ?? fallback).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/u).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
