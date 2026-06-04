import { useEffect, useRef, useState } from "react";
import { Locate, MapPin, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

export type LocationValue = {
  lat: number | null;
  lng: number | null;
  radius: number;
  label?: string;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type Props = {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
};

export function LocationFilter({ value, onChange }: Props) {
  const [query, setQuery] = useState(value.label ?? "");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    setQuery(value.label ?? "");
  }, [value.label]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", query);
        url.searchParams.set("format", "json");
        url.searchParams.set("countrycodes", "no");
        url.searchParams.set("limit", "6");
        url.searchParams.set("addressdetails", "0");
        const res = await fetch(url.toString(), {
          headers: { "Accept-Language": "nb" },
        });
        if (res.ok) {
          const data: NominatimResult[] = await res.json();
          setResults(data);
          setOpen(true);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(debounce.current);
  }, [query]);

  const pick = (r: NominatimResult) => {
    onChange({
      ...value,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      label: r.display_name.split(",").slice(0, 2).join(", "),
    });
    setOpen(false);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Posisjon ikke støttet i denne nettleseren");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          ...value,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Min posisjon",
        });
      },
      () => toast.error("Kunne ikke hente posisjon"),
    );
  };

  const clear = () => {
    onChange({ lat: null, lng: null, radius: value.radius, label: "" });
    setQuery("");
    setResults([]);
  };

  const hasLocation = value.lat != null && value.lng != null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Popover open={open && results.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative min-w-[240px] flex-1">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sted (f.eks. Oslo, Bergen, 7030)"
              className="pl-9 pr-9"
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
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[320px] p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {loading && <div className="px-2 py-1.5 text-sm text-muted-foreground">Søker…</div>}
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => pick(r)}
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              {r.display_name}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
        <Locate className="size-4" /> Min posisjon
      </Button>

      {hasLocation && (
        <div className="flex min-w-[200px] flex-1 items-center gap-3">
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            Radius: {value.radius} km
          </span>
          <Slider
            value={[value.radius]}
            min={1}
            max={100}
            step={1}
            onValueChange={([v]) => onChange({ ...value, radius: v })}
            className="flex-1"
          />
        </div>
      )}
    </div>
  );
}
