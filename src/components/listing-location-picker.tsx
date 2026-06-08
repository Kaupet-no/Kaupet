import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const AREA_RADIUS_M = 500;

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapClickHandler({ onChange }: { onChange: (next: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      const p = e.latlng;
      onChange({ lat: p.lat, lng: p.lng });
    },
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const last = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = { lat, lng };
    // Only recenter when location jumps significantly (e.g. new geocode result),
    // not on small drag adjustments.
    if (!prev) {
      const bounds = L.latLng(lat, lng).toBounds(AREA_RADIUS_M * 2.4);
      map.fitBounds(bounds, { padding: [16, 16] });
      return;
    }
    const moved = map.distance([prev.lat, prev.lng], [lat, lng]);
    if (moved > 1000) {
      const bounds = L.latLng(lat, lng).toBounds(AREA_RADIUS_M * 2.4);
      map.fitBounds(bounds, { padding: [16, 16] });
    }
  }, [lat, lng, map]);
  return null;
}

type Props = {
  lat: number;
  lng: number;
  onChange: (next: { lat: number; lng: number }) => void;
};

export function ListingLocationPicker({ lat, lng, onChange }: Props) {
  const handlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const m = e.target as L.Marker;
        const p = m.getLatLng();
        onChange({ lat: p.lat, lng: p.lng });
      },
    }),
    [onChange],
  );

  return (
    <div className="isolate h-72 w-full overflow-hidden rounded-2xl border border-border">
      <MapContainer
        center={[lat, lng]}
        zoom={13}
        scrollWheelZoom
        zoomControl
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <Circle
          center={[lat, lng]}
          radius={AREA_RADIUS_M}
          pathOptions={{
            color: "oklch(0.5 0.02 140)",
            weight: 2,
            opacity: 0.9,
            fillColor: "oklch(0.5 0.02 140)",
            fillOpacity: 0.15,
          }}
        />
        <Marker position={[lat, lng]} draggable icon={defaultIcon} eventHandlers={handlers} />
        <MapClickHandler onChange={onChange} />
        <Recenter lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
