import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const locationIcon = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:9999px;background:oklch(0.5 0.02 140);border:3px solid white;box-shadow:0 0 0 3px oklch(0.5 0.02 140/0.3),0 4px 12px hsl(0 0% 0%/0.2);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

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
      <Marker position={[lat, lng]} icon={locationIcon} />
    </MapContainer>
  );
}
