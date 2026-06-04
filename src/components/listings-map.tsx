import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { signListingImageUrls } from "@/lib/storage";

const centerIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:hsl(var(--primary));border:3px solid white;box-shadow:0 0 0 2px hsl(var(--primary)/0.4),0 4px 14px hsl(var(--primary)/0.35);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export type MapListing = {
  id: string;
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
  onAreaSearch?: (c: { lat: number; lng: number }) => void;
  className?: string;
};

function formatPriceShort(l: MapListing) {
  if (l.is_free) return "Gratis";
  if (l.price_nok == null) return "Spør";
  if (l.price_nok >= 1000) return `${Math.round(l.price_nok / 100) / 10}k kr`;
  return `${l.price_nok} kr`;
}

function formatPriceFull(l: MapListing) {
  if (l.is_free) return "Gis bort";
  if (l.price_nok == null) return "Pris ved henvendelse";
  return `${l.price_nok.toLocaleString("nb-NO")} kr`;
}

function makePricePin(l: MapListing, opts: { hovered: boolean; active: boolean }) {
  const label = formatPriceShort(l);
  const isFree = l.is_free;
  const bg = opts.active
    ? "hsl(var(--primary))"
    : isFree
      ? "hsl(var(--accent))"
      : "white";
  const color = opts.active
    ? "hsl(var(--primary-foreground))"
    : isFree
      ? "hsl(var(--accent-foreground))"
      : "hsl(var(--foreground))";
  const border = opts.active ? "hsl(var(--primary))" : "hsl(var(--border))";
  const scale = opts.hovered || opts.active ? 1.08 : 1;
  const z = opts.active ? 1000 : opts.hovered ? 900 : 1;
  return L.divIcon({
    className: "kpt-price-pin",
    html: `<div style="
      transform:scale(${scale});
      transition:transform 140ms ease;
      background:${bg};
      color:${color};
      border:1.5px solid ${border};
      box-shadow:0 4px 14px hsl(0 0% 0% / 0.18);
      padding:4px 10px;
      border-radius:9999px;
      font-size:12px;
      font-weight:600;
      white-space:nowrap;
      font-family:inherit;
      z-index:${z};
    ">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 12],
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
    // Tilpass kartet slik at hele radius-sirkelen synes med litt luft rundt.
    const bounds = L.latLng(center.lat, center.lng).toBounds(radiusKm * 1000 * 2.2);
    map.fitBounds(bounds, { animate: true, padding: [20, 20] });
  }, [center, radiusKm, map]);
  return null;
}

function ClickHandler({ onClick }: { onClick?: (c: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function AreaSearchTracker({
  center,
  onShow,
}: {
  center: { lat: number; lng: number } | null;
  onShow: (c: { lat: number; lng: number } | null) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      if (!center) {
        onShow({ lat: c.lat, lng: c.lng });
        return;
      }
      const d = distanceMeters({ lat: c.lat, lng: c.lng }, center);
      if (d > 500) onShow({ lat: c.lat, lng: c.lng });
      else onShow(null);
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
  onAreaSearch,
  className,
}: Props) {
  const initial = center ?? NORWAY_CENTER;
  const zoom = center ? 11 : 5;
  const [areaCenter, setAreaCenter] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div className={`relative ${className ?? ""}`}>
      <MapContainer
        center={[initial.lat, initial.lng]}
        zoom={zoom}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full rounded-2xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <CenterUpdater center={center} radiusKm={radiusKm} />
        <ClickHandler onClick={onCenterChange} />
        {onAreaSearch && <AreaSearchTracker center={center} onShow={setAreaCenter} />}
        {center && (
          <>
            <Circle
              center={[center.lat, center.lng]}
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
              position={[center.lat, center.lng]}
              icon={centerIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const p = m.getLatLng();
                  onCenterChange?.({ lat: p.lat, lng: p.lng });
                },
              }}
            />
          </>
        )}
        {listings.map((l) => (
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
      {onAreaSearch && areaCenter && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] flex justify-center">
          <Button
            type="button"
            size="sm"
            className="pointer-events-auto rounded-full shadow-lg"
            onClick={() => {
              onAreaSearch(areaCenter);
              setAreaCenter(null);
            }}
          >
            Søk i dette området
          </Button>
        </div>
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
    () => makePricePin(listing, { hovered, active }),
    [listing, hovered, active],
  );
  return (
    <Marker
      position={[listing.lat, listing.lng]}
      icon={icon}
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
      <p className="mt-1 font-display text-sm">{formatPriceFull(listing)}</p>
      <Link
        to="/annonse/$id"
        params={{ id: listing.id }}
        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
      >
        Se annonse →
      </Link>
    </div>
  );
}
