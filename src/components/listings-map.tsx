import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "@tanstack/react-router";
import { MapPin, Search as SearchIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { NativeSheet } from "@/components/ui/native-sheet";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import { signListingImageUrls } from "@/lib/storage";
import { useNominatimSearch, type NominatimResult } from "@/hooks/use-nominatim-search";
import { isValidMapCoordinate, KARTVERKET_TILE_LAYER } from "@/lib/kartverket-map";

const EARTH_RADIUS_KM = 6371;

const centerIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:var(--primary);border:3px solid white;box-shadow:0 0 0 2px var(--primary),0 2px 8px hsl(0 0% 0% / 0.28);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Kryss for å fjerne radius-filteret, plassert rett utenfor sirkelkanten
// (se clearIconPosition) slik at det ikke havner oppå senter-markøren eller
// annonse-merkene som kan ligge midt i sirkelen. Skjult til brukeren hovrer
// over kartet (ren CSS via den omkringliggende ".group"-diven — Leaflets lag
// havner i DOM-treet under den, så group-hover fungerer selv om ikonet er
// statisk HTML), men alltid synlig på touch-enheter siden de ikke har hover.
function makeClearIcon(alwaysVisible: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="${
      alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
    } transition-opacity" style="width:22px;height:22px;border-radius:9999px;background:white;border:1.5px solid var(--primary);box-shadow:0 2px 8px hsl(0 0% 0% / 0.28);display:flex;align-items:center;justify-content:center;cursor:pointer;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </div>`,
    iconSize: [22, 22],
    // Bunn-midt anker: ikonet tegnes rett over det geografiske punktet
    // (toppen av sirkelen), med litt luft ut over kanten.
    iconAnchor: [11, 28],
  });
}

// Punktet rett nord for senter, på selve sirkelkanten (radiusKm unna) — der
// kryss-ikonet plasseres slik at det ikke overlapper senter-markøren eller
// annonser inni sirkelen.
function clearIconPosition(
  center: { lat: number; lng: number },
  radiusKm: number,
): { lat: number; lng: number } {
  return {
    lat: center.lat + (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI),
    lng: center.lng,
  };
}

export type MapListing = {
  id: string;
  kaupet_code: string;
  title: string;
  price_nok: number | null;
  is_free: boolean;
  lat: number;
  lng: number;
  cover_path?: string | null;
};
type Props = {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  listings: MapListing[];
  hoveredId?: string | null;
  activeId?: string | null;
  onMarkerHover?: (id: string | null) => void;
  onMarkerSelect?: (id: string | null) => void;
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  onRadiusChange?: (km: number) => void;
  onClearLocation?: () => void;
  onApplyViewport?: (c: { lat: number; lng: number }, radiusKm: number) => void;
  deferViewport?: boolean;
  edgeToEdge?: boolean;
  compactTouchControls?: boolean;
  className?: string;
};

function makeLocationPin(_l: MapListing, opts: { hovered: boolean; active: boolean }) {
  const scale = opts.hovered || opts.active ? 1.25 : 1;
  const z = opts.active ? 1000 : opts.hovered ? 900 : 1;
  return L.divIcon({
    className: "kpt-location-pin",
    html: `<div style="
      transform:scale(${scale});
      transition:transform 140ms ease;
      width:20px;
      height:20px;
      border-radius:9999px;
      background:var(--primary);
      border:2px solid var(--primary);
      box-shadow:0 2px 10px hsl(0 0% 0% / 0.32),0 0 0 1.5px white;
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:${z};
    "><div style="
      width:8px;
      height:8px;
      border-radius:9999px;
      background:white;
    "></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function CenterUpdater({
  center,
  radiusKm,
}: {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
}) {
  const map = useMap();
  const last = useRef<string>("");
  useEffect(() => {
    if (!center) return;
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)},${radiusKm}`;
    if (key === last.current) return;
    last.current = key;
    // Tilpass kartet slik at hele radius-sirkelen synes med litt luft rundt,
    // men bare hvis sirkelen faktisk faller utenfor gjeldende synsfelt — unngår
    // at kartet hopper rundt for hver tick mens brukeren drar radius-slideren.
    const bounds = L.latLng(center.lat, center.lng).toBounds(radiusKm * 1000 * 2.2);
    if (map.getBounds().contains(bounds)) return;
    map.fitBounds(bounds, { animate: true, padding: [20, 20] });
  }, [center, radiusKm, map]);
  return null;
}

function ClickHandler({
  onClick,
  disabled,
}: {
  onClick?: (c: { lat: number; lng: number }) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function HoverRadiusPreview({ radiusKm }: { radiusKm: number }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useMapEvents({
    mousemove(e) {
      setPos({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mouseout() {
      setPos(null);
    },
  });
  if (!pos) return null;
  return (
    <Circle
      center={[pos.lat, pos.lng]}
      radius={radiusKm * 1000}
      pathOptions={{
        color: "hsl(var(--primary))",
        fillColor: "hsl(var(--primary))",
        fillOpacity: 0.04,
        weight: 1.5,
        opacity: 0.4,
        dashArray: "4 4",
      }}
      interactive={false}
    />
  );
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function ZoomRadiusSync({
  active,
  onDefaultRadius,
}: {
  active: boolean;
  onDefaultRadius: (km: number) => void;
}) {
  const sync = (m: L.Map) => {
    const bounds = m.getBounds();
    const center = m.getCenter();
    const widthMeters = distanceMeters(
      { lat: center.lat, lng: bounds.getWest() },
      { lat: center.lat, lng: bounds.getEast() },
    );
    const km = Math.round(widthMeters / 1000 / 4);
    onDefaultRadius(Math.min(100, Math.max(1, km)));
  };
  const map = useMapEvents({
    zoomend: () => active && sync(map),
    moveend: () => active && sync(map),
  });
  useEffect(() => {
    if (active) sync(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return null;
}

function MapViewportReporter({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (center: { lat: number; lng: number }) => void;
}) {
  const map = useMapEvents({
    dragend: () => {
      if (enabled) onChange(map.getCenter());
    },
    zoomend: () => {
      if (enabled) onChange(map.getCenter());
    },
  });
  return null;
}

const NORWAY_CENTER = { lat: 64.5, lng: 11.0 };

export function ListingsMap({
  center,
  radiusKm,
  listings,
  hoveredId,
  activeId,
  onMarkerHover,
  onMarkerSelect,
  onCenterChange,
  onRadiusChange,
  onClearLocation,
  onApplyViewport,
  deferViewport = false,
  edgeToEdge = false,
  compactTouchControls = false,
  className,
}: Props) {
  const initial = isValidMapCoordinate(center) ? center : NORWAY_CENTER;
  const mapCenter = isValidMapCoordinate(center) ? center : null;
  const validListings = listings.filter(isValidMapCoordinate);
  const [previewRadiusKm, setPreviewRadiusKm] = useState(radiusKm);
  const [radiusManuallySet, setRadiusManuallySet] = useState(false);
  const [isSliderInteracting, setIsSliderInteracting] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [pendingCenter, setPendingCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [controlLocation, setControlLocation] = useState<LocationValue>(() => ({
    lat: mapCenter?.lat ?? null,
    lng: mapCenter?.lng ?? null,
    radius: radiusKm,
    label: "",
  }));
  const {
    results: locResults,
    loading: locLoading,
    searchedQuery: locSearchedQuery,
    search: searchLocation,
    clear: clearLocationSearch,
  } = useNominatimSearch();
  useEffect(() => {
    // Ruten er fasit etter et eksplisitt søk eller et filterapply.
    setPendingCenter(null);
  }, [center?.lat, center?.lng, radiusKm]);
  useEffect(() => {
    setControlLocation({
      lat: mapCenter?.lat ?? null,
      lng: mapCenter?.lng ?? null,
      radius: radiusKm,
      label: "",
    });
  }, [mapCenter?.lat, mapCenter?.lng, radiusKm]);
  useEffect(() => {
    // Når et filter allerede er aktivt (eller brukeren har justert slideren
    // selv), er radiusKm-propen fasit. Før noe filter er satt følger radiusen
    // i stedet dynamisk standardverdi.
    if (mapCenter || radiusManuallySet) setPreviewRadiusKm(radiusKm);
  }, [radiusKm, mapCenter, radiusManuallySet]);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none)").matches);
  }, []);

  const clearIcon = useMemo(() => makeClearIcon(isTouchDevice), [isTouchDevice]);

  const handleClear = () => {
    setPendingCenter(null);
    onClearLocation?.();
    setRadiusManuallySet(false);
  };

  const commitCenter = (c: { lat: number; lng: number }) => {
    if (deferViewport) {
      setPendingCenter(c);
      return;
    }
    onCenterChange?.(c);
    if (previewRadiusKm !== radiusKm) onRadiusChange?.(previewRadiusKm);
  };

  const commitRadius = (km: number) => {
    setPreviewRadiusKm(km);
    setRadiusManuallySet(true);
    if (deferViewport) setPendingCenter((previous) => previous ?? mapCenter);
    else if (mapCenter) onRadiusChange?.(km);
  };

  const applyPendingViewport = () => {
    if (!pendingCenter || !onApplyViewport) return;
    onApplyViewport(pendingCenter, previewRadiusKm);
  };

  const pickLocResult = (r: NominatimResult) => {
    const next = { lat: Number.parseFloat(r.lat), lng: Number.parseFloat(r.lon) };
    if (!isValidMapCoordinate(next)) return;
    commitCenter(next);
    setLocQuery("");
    clearLocationSearch();
  };

  return (
    <div className={`group relative ${className ?? ""}`}>
      <MapContainer
        center={[initial.lat, initial.lng]}
        zoom={mapCenter ? 11 : 5}
        scrollWheelZoom
        zoomControl={false}
        className={`h-full w-full ${edgeToEdge ? "" : "rounded-2xl"}`}
      >
        <TileLayer {...KARTVERKET_TILE_LAYER} />
        <MapViewportReporter enabled={deferViewport} onChange={setPendingCenter} />
        <CenterUpdater center={mapCenter} radiusKm={radiusKm} />
        <ClickHandler onClick={commitCenter} />
        <ZoomRadiusSync
          active={!mapCenter && !radiusManuallySet}
          onDefaultRadius={setPreviewRadiusKm}
        />
        {!mapCenter && <HoverRadiusPreview radiusKm={previewRadiusKm} />}
        {mapCenter && (
          <>
            <Circle
              center={[mapCenter.lat, mapCenter.lng]}
              radius={radiusKm * 1000}
              pathOptions={{
                color: "hsl(var(--primary))",
                fillColor: "hsl(var(--primary))",
                fillOpacity: 0.06,
                weight: 1.5,
                opacity: 0.5,
              }}
            />
            <Marker
              position={[mapCenter.lat, mapCenter.lng]}
              icon={centerIcon}
              title="Flytt søkesenter"
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const p = m.getLatLng();
                  commitCenter({ lat: p.lat, lng: p.lng });
                },
              }}
            />
            {onClearLocation && (
              <Marker
                position={[
                  clearIconPosition(mapCenter, radiusKm).lat,
                  clearIconPosition(mapCenter, radiusKm).lng,
                ]}
                icon={clearIcon}
                title="Fjern sted"
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stop(e);
                    handleClear();
                  },
                }}
              />
            )}
          </>
        )}
        {validListings.map((l) => (
          <PriceMarker
            key={l.id}
            listing={l}
            hovered={hoveredId === l.id}
            active={activeId === l.id}
            onHover={onMarkerHover}
            onSelect={onMarkerSelect}
          />
        ))}
      </MapContainer>
      {onRadiusChange && !compactTouchControls && (
        <div className="absolute left-3 top-3 z-[400]">
          <div
            className={`rounded-2xl border border-border bg-card/95 shadow-lg backdrop-blur transition-[width,padding] duration-200 ${
              isTouchDevice || isSliderInteracting
                ? "w-56 p-3"
                : "w-9 p-2 group-hover:w-56 group-hover:p-3"
            } overflow-hidden`}
          >
            <div
              className={`flex items-center gap-2 ${
                isTouchDevice || isSliderInteracting ? "" : "group-hover:hidden"
              }`}
            >
              <MapPin className="size-5 shrink-0 text-muted-foreground" />
            </div>
            <div
              className={`space-y-2 ${
                isTouchDevice || isSliderInteracting ? "" : "hidden group-hover:block"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Radius</span>
                <div className="flex items-center gap-1">
                  <span className="font-display text-sm">{previewRadiusKm} km</span>
                  {center && onClearLocation && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                      aria-label="Fjern radius-filter"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <Slider
                value={[previewRadiusKm]}
                min={1}
                max={100}
                step={1}
                onValueChange={([v]) => commitRadius(v)}
                onPointerDown={() => setIsSliderInteracting(true)}
                onValueCommit={([v]) => {
                  setIsSliderInteracting(false);
                  commitRadius(v);
                }}
                aria-label="Søkeradius i kilometer"
              />
              <form
                className="flex gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchLocation(locQuery);
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={locQuery}
                    onChange={(event) => {
                      setLocQuery(event.target.value);
                      clearLocationSearch();
                    }}
                    placeholder="Sted eller postnummer"
                    className="h-8 pl-7 text-xs"
                    aria-label="Søk etter sted eller postnummer"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={locQuery.trim().length < 2 || locLoading}
                >
                  Søk
                </Button>
              </form>
            </div>
          </div>
          {(isTouchDevice || isSliderInteracting || locSearchedQuery !== null) && (
            <div
              className={`absolute left-0 top-full mt-1 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg ${
                isTouchDevice || isSliderInteracting ? "" : "hidden group-hover:block"
              }`}
            >
              {locLoading && <div className="px-2 py-2 text-xs text-muted-foreground">Søker…</div>}
              {!locLoading && locSearchedQuery === locQuery.trim() && locResults.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">Ingen treff</div>
              )}
              {locResults.map((r) => (
                <button
                  key={r.place_id}
                  type="button"
                  onClick={() => pickLocResult(r)}
                  className="flex w-full items-start gap-2 px-2 py-2 text-left text-xs hover:bg-muted"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {compactTouchControls && onRadiusChange && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute left-4 top-4 z-[400] size-12 rounded-full shadow-md"
            aria-label="Sted og radius"
            onClick={() => setLocationSheetOpen(true)}
          >
            <MapPin className="size-5" />
          </Button>
          <NativeSheet
            open={locationSheetOpen}
            onOpenChange={setLocationSheetOpen}
            title="Sted og radius"
            titleVisible
            expandable
          >
            <div className="mt-3 space-y-5">
              <LocationPicker
                value={controlLocation}
                onChange={(next) => {
                  setControlLocation(next);
                  if (next.lat != null && next.lng != null) {
                    commitCenter({ lat: next.lat, lng: next.lng });
                  }
                }}
                autoFocus={false}
              />
              <RadiusPicker value={previewRadiusKm} onChange={commitRadius} />
              <Button
                type="button"
                size="native"
                className="w-full"
                onClick={() => {
                  applyPendingViewport();
                  setLocationSheetOpen(false);
                }}
              >
                Bruk
              </Button>
            </div>
          </NativeSheet>
        </>
      )}
      {deferViewport && pendingCenter && onApplyViewport && (
        <Button
          type="button"
          size="native"
          className="absolute inset-x-4 bottom-4 z-[400] shadow-lg"
          onClick={applyPendingViewport}
        >
          Søk i dette området
        </Button>
      )}
    </div>
  );
}

function PriceMarker({
  listing,
  hovered,
  active,
  onHover,
  onSelect,
}: {
  listing: MapListing;
  hovered: boolean;
  active: boolean;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
}) {
  const icon = useMemo(
    () => makeLocationPin(listing, { hovered, active }),
    [listing, hovered, active],
  );
  return (
    <Marker
      position={[listing.lat, listing.lng]}
      icon={icon}
      title={`Åpne annonse: ${listing.title}`}
      eventHandlers={{
        mouseover: () => onHover?.(listing.id),
        mouseout: () => onHover?.(null),
        click: () => onSelect?.(listing.id),
        popupclose: () => onSelect?.(null),
      }}
    >
      <Popup closeButton={false} minWidth={220} maxWidth={240}>
        <PopupCard listing={listing} />
      </Popup>
    </Marker>
  );
}

function PopupCard({ listing }: { listing: MapListing }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!listing.cover_path) return;
    let cancelled = false;
    signListingImageUrls([listing.cover_path]).then((map) => {
      if (!cancelled) setImgUrl(map[listing.cover_path!] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.cover_path]);

  return (
    <div className="w-[220px] overflow-hidden">
      <div className="relative -mx-3 -mt-3 mb-2 aspect-[16/10] bg-muted">
        {imgUrl ? (
          <img src={imgUrl} alt={listing.title} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            Ingen bilde
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</p>
      <Link
        to="/$kaupetCode"
        params={{ kaupetCode: listing.kaupet_code }}
        state={{ fromSearch: true } as never}
        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
      >
        Se annonse →
      </Link>
    </div>
  );
}
