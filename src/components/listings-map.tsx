import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "@tanstack/react-router";

// Fix default marker icon (Leaflet expects assets at relative paths)
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const centerIcon = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:9999px;background:hsl(var(--primary, 220 90% 56%));border:3px solid white;box-shadow:0 0 0 2px hsl(var(--primary, 220 90% 56%));"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export type MapListing = {
  id: string;
  title: string;
  price_nok: number | null;
  is_free: boolean;
  lat: number;
  lng: number;
};

type Props = {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  listings: MapListing[];
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  className?: string;
};

function formatPrice(l: MapListing) {
  if (l.is_free) return "Gis bort";
  if (l.price_nok == null) return "Pris ved henvendelse";
  return `${l.price_nok.toLocaleString("nb-NO")} kr`;
}

function CenterUpdater({ center }: { center: { lat: number; lng: number } | null }) {
  const map = useMap();
  const last = useRef<string>("");
  useEffect(() => {
    if (!center) return;
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
    if (key === last.current) return;
    last.current = key;
    map.setView([center.lat, center.lng], map.getZoom() ?? 11, { animate: true });
  }, [center, map]);
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

const NORWAY_CENTER = { lat: 64.5, lng: 11.0 };

export function ListingsMap({ center, radiusKm, listings, onCenterChange, className }: Props) {
  const initial = center ?? NORWAY_CENTER;
  const zoom = center ? 11 : 5;

  return (
    <div className={className}>
      <MapContainer
        center={[initial.lat, initial.lng]}
        zoom={zoom}
        scrollWheelZoom
        className="h-full w-full rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CenterUpdater center={center} />
        <ClickHandler onClick={onCenterChange} />
        {center && (
          <>
            <Circle
              center={[center.lat, center.lng]}
              radius={radiusKm * 1000}
              pathOptions={{ color: "hsl(var(--primary))", fillOpacity: 0.08, weight: 2 }}
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
          <Marker key={l.id} position={[l.lat, l.lng]}>
            <LeafletPopup listing={l} />
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// Inline popup component using react-leaflet Popup
import { Popup } from "react-leaflet";
function LeafletPopup({ listing }: { listing: MapListing }) {
  return (
    <Popup>
      <div className="space-y-1">
        <p className="font-medium">{listing.title}</p>
        <p className="text-sm">{formatPrice(listing)}</p>
        <Link
          to="/annonse/$id"
          params={{ id: listing.id }}
          className="text-sm text-primary underline"
        >
          Se annonse
        </Link>
      </div>
    </Popup>
  );
}
