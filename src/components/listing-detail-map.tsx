import { MapContainer, TileLayer, Circle, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const AREA_RADIUS_M = 500;

function FitToCircle({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(lat, lng).toBounds(radius * 2.4);
    map.fitBounds(bounds, { padding: [16, 16] });
  }, [lat, lng, radius, map]);
  return null;
}

type Props = {
  lat: number;
  lng: number;
};

export function ListingDetailMap({ lat, lng }: Props) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom
      zoomControl={false}
      className="h-full w-full rounded-2xl"
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
      <FitToCircle lat={lat} lng={lng} radius={AREA_RADIUS_M} />
    </MapContainer>
  );
}
