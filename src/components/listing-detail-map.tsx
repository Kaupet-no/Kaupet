import { MapContainer, TileLayer, Circle, CircleMarker, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { KARTVERKET_TILE_LAYER } from "@/lib/kartverket-map";

const AREA_RADIUS_M = 500;
/** Utsnitt rundt en eksakt adresse (besøksadresse), i meter. */
const EXACT_RADIUS_M = 120;

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
  interactive?: boolean;
  /** Punktet er en eksakt adresse, ikke et omtrentlig område. */
  exact?: boolean;
};

export function ListingDetailMap({ lat, lng, interactive = true, exact = false }: Props) {
  const pathOptions = {
    color: "oklch(0.5 0.02 140)",
    weight: 2,
    opacity: 0.9,
    fillColor: "oklch(0.5 0.02 140)",
  };
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={interactive}
      dragging={interactive}
      touchZoom={interactive}
      doubleClickZoom={interactive}
      zoomControl={false}
      className="h-full w-full rounded-2xl"
    >
      <TileLayer {...KARTVERKET_TILE_LAYER} />
      {exact ? (
        <CircleMarker
          center={[lat, lng]}
          radius={9}
          pathOptions={{ ...pathOptions, weight: 3, fillOpacity: 0.9 }}
        />
      ) : (
        <Circle
          center={[lat, lng]}
          radius={AREA_RADIUS_M}
          pathOptions={{ ...pathOptions, fillOpacity: 0.15 }}
        />
      )}
      <FitToCircle lat={lat} lng={lng} radius={exact ? EXACT_RADIUS_M : AREA_RADIUS_M} />
    </MapContainer>
  );
}
