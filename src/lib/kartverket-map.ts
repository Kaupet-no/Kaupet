export type MapCoordinate = { lat: number; lng: number };

export const KARTVERKET_TILE_LAYER = {
  attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
  url: "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
} as const;

export function isValidMapCoordinate(
  coordinate: Partial<MapCoordinate> | null | undefined,
): coordinate is MapCoordinate {
  const lat = coordinate?.lat;
  const lng = coordinate?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
