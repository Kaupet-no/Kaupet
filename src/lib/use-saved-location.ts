import { useEffect, useState } from "react";
import type { LocationValue } from "@/components/location-filter";

const KEY = "kaupet.app.location";

const DEFAULT: LocationValue = { lat: null, lng: null, radius: 25, label: "" };

function read(): LocationValue {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT;
    return {
      lat: typeof parsed.lat === "number" ? parsed.lat : null,
      lng: typeof parsed.lng === "number" ? parsed.lng : null,
      radius: typeof parsed.radius === "number" ? parsed.radius : 25,
      label: typeof parsed.label === "string" ? parsed.label : "",
    };
  } catch {
    return DEFAULT;
  }
}

export function useSavedLocation(): [LocationValue, (v: LocationValue) => void] {
  const [value, setValue] = useState<LocationValue>(DEFAULT);

  useEffect(() => {
    setValue(read());
  }, []);

  const update = (v: LocationValue) => {
    setValue(v);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };

  return [value, update];
}
