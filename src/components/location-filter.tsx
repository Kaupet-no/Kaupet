import { useEffect, useState } from "react";
import { Locate, MapPin, Search as SearchIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { showErrorToast } from "@/lib/toast";
import {
  checkLocationPermission,
  getCurrentPosition,
  requestLocationPermission,
} from "@/lib/native";
import { useNominatimSearch, type NominatimResult } from "@/hooks/use-nominatim-search";

export type LocationValue = {
  lat: number | null;
  lng: number | null;
  radius: number;
  label?: string;
};

type LocationPickerProps = {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  /** Called after the popover should close (user picked or cleared). */
  onDone?: () => void;
  /** Focus the input as soon as it mounts. Default true. */
  autoFocus?: boolean;
};

export function LocationPicker({ value, onChange, onDone, autoFocus = true }: LocationPickerProps) {
  const [query, setQuery] = useState(value.label ?? "");
  const { results, loading, searchedQuery, search, clear: clearSearch } = useNominatimSearch();
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | null>(null);

  useEffect(() => {
    checkLocationPermission().then((status) => {
      if (status === "granted") setLocationPermission("granted");
    });
  }, []);

  useEffect(() => {
    setQuery(value.label ?? "");
  }, [value.label]);

  const pick = (r: NominatimResult) => {
    onChange({
      ...value,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      label: r.display_name.split(",").slice(0, 2).join(", "),
    });
    onDone?.();
  };

  const useMyLocation = async () => {
    try {
      const permission = await requestLocationPermission();
      setLocationPermission(permission);
      if (permission !== "granted") {
        showErrorToast("Tillat posisjon i telefoninnstillingene for å bruke denne funksjonen");
        return;
      }
      const pos = await getCurrentPosition();
      if (!pos) {
        showErrorToast("Posisjon ikke støttet på denne enheten");
        return;
      }
      onChange({
        ...value,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: "Min posisjon",
      });
      onDone?.();
    } catch {
      showErrorToast("Kunne ikke hente posisjon");
    }
  };

  const clear = () => {
    onChange({ lat: null, lng: null, radius: value.radius, label: "" });
    setQuery("");
    clearSearch();
  };

  const hasLocation = value.lat != null && value.lng != null;

  return (
    <div className="w-full space-y-2 p-1">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus={autoFocus}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              clearSearch();
            }}
            placeholder="Sted eller postnummer"
            className="pl-8 pr-8"
            aria-label="Søk etter sted"
          />
          {hasLocation && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Fjern lokasjon"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="outline" disabled={query.trim().length < 2 || loading}>
          Søk
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Søket sendes til OpenStreetMap når du trykker Søk.
      </p>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full justify-start"
        onClick={useMyLocation}
        disabled={locationPermission === "denied"}
        title={
          locationPermission === "denied" ? "Tillat posisjon i telefoninnstillingene" : undefined
        }
      >
        <Locate className="size-4" />
        {locationPermission === "denied" ? "Posisjon ikke tillatt" : "Bruk min posisjon"}
      </Button>
      <div className="max-h-[260px] overflow-y-auto">
        {loading && <div className="px-2 py-2 text-sm text-muted-foreground">Søker…</div>}
        {!loading && searchedQuery === query.trim() && results.length === 0 && (
          <div className="px-2 py-2 text-sm text-muted-foreground">Ingen treff</div>
        )}
        {results.map((r) => (
          <button
            key={r.place_id}
            type="button"
            onClick={() => pick(r)}
            className="native-touch-target flex min-h-14 w-full items-start gap-2 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted"
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="line-clamp-2">{r.display_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type RadiusPickerProps = {
  value: number;
  onChange: (v: number) => void;
};

export function RadiusPicker({
  value,
  onChange,
  disabled,
}: RadiusPickerProps & { disabled?: boolean }) {
  return (
    <div className={`w-full space-y-3 p-2 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Radius / omkrets</span>
        <span className="font-display text-sm">{value} km</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[5, 10, 25, 50, 100].map((radius) => (
          <Button
            key={radius}
            type="button"
            size="default"
            variant={value === radius ? "default" : "outline"}
            className="min-h-13 px-2"
            disabled={disabled}
            onClick={() => onChange(radius)}
          >
            {radius} km
          </Button>
        ))}
      </div>
      <Slider
        value={[value]}
        min={1}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v)}
        disabled={disabled}
        aria-label="Søkeradius i kilometer"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>1 km</span>
        <span>100 km</span>
      </div>
    </div>
  );
}
