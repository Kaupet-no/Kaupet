import { useMemo, useRef, useEffect, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  defaultMarkerIcon,
  CARTO_TILE_LAYER,
  CIRCLE_STYLE,
} from "@/components/listing-location-picker";

const AREA_RADIUS_M = 500;

function MapClickHandler({ onChange }: { onChange: (next: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FitOnMount({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    const bounds = L.latLng(lat, lng).toBounds(AREA_RADIUS_M * 2.4);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [lat, lng, map]);
  return null;
}

type Props = {
  lat: number;
  lng: number;
  onConfirm: (next: { lat: number; lng: number }) => void;
  onClose: () => void;
};

export function FullscreenLocationPicker({ lat, lng, onConfirm, onClose }: Props) {
  const [draft, setDraft] = useState({ lat, lng });

  const handlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const m = e.target as L.Marker;
        const p = m.getLatLng();
        setDraft({ lat: p.lat, lng: p.lng });
      },
    }),
    [],
  );

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          aria-label="Avbryt"
        >
          <X className="size-5" />
        </button>
        <span className="text-sm font-medium">Juster posisjon</span>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onConfirm(draft);
            onClose();
          }}
          className="gap-1.5"
        >
          <Check className="size-4" />
          Bekreft
        </Button>
      </div>

      {/* Map – fills remaining space */}
      <div className="relative min-h-0 flex-1">
        <MapContainer
          center={[draft.lat, draft.lng]}
          zoom={13}
          scrollWheelZoom
          zoomControl={false}
          touchZoom
          className="h-full w-full"
        >
          <TileLayer {...CARTO_TILE_LAYER} />
          <Circle
            center={[draft.lat, draft.lng]}
            radius={AREA_RADIUS_M}
            pathOptions={CIRCLE_STYLE}
          />
          <Marker
            position={[draft.lat, draft.lng]}
            draggable
            icon={defaultMarkerIcon}
            eventHandlers={handlers}
          />
          <MapClickHandler onChange={setDraft} />
          <FitOnMount lat={lat} lng={lng} />
        </MapContainer>

        {/* Hint overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <span className="rounded-full bg-background/90 px-4 py-1.5 text-xs text-muted-foreground shadow">
            Trykk på kartet eller dra markøren for å justere
          </span>
        </div>
      </div>
    </div>
  );
}
