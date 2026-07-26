import { useEffect, useRef, useState } from "react";
import { showErrorToast } from "@/lib/toast";
import { lookupPostalCode, reverseGeocodeAddress } from "@/lib/geocode";
import { getCurrentPosition, requestLocationPermission, isNative } from "@/lib/native";

type Coords = { lat: number; lng: number };

/**
 * Owns the new-listing wizard's location step: postal-code vs. GPS choice,
 * postal-code -> city/coords autofill, GPS lookup + reverse-geocode, and the
 * fullscreen map picker's "marker moved manually" bookkeeping. Pulled out of
 * ny-annonse.tsx, same pattern as useDraftAutosave / useVehicleLookupFlow.
 */
export function useLocationPicker(params: {
  postalCode: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any, options?: any) => void;
}) {
  const { postalCode, setValue } = params;

  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMethod, setLocationMethod] = useState<"gps" | "postal" | null>(null);
  const [fullscreenMapOpen, setFullscreenMapOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const lastEditedRef = useRef<"postal_code" | "city" | "map" | null>(null);
  const markerMovedRef = useRef(false);

  // Auto-fill city from postal code
  useEffect(() => {
    if (lastEditedRef.current !== "postal_code") return;
    const p = (postalCode ?? "").trim();
    // Clear the (possibly stale, e.g. carried over from a pre-filled draft or
    // the user's previous listing) city immediately so it never keeps
    // showing a place that doesn't match what's currently typed, even while
    // the lookup below is still in flight or ends up failing.
    setValue("city", "", { shouldValidate: false });
    if (!/^\d{4}$/.test(p)) return;
    const t = window.setTimeout(async () => {
      const r = await lookupPostalCode(p);
      if (!r) {
        showErrorToast("Fant ikke sted for dette postnummeret. Sjekk at det stemmer.");
        return;
      }
      if (r.city) setValue("city", r.city, { shouldValidate: false });
      if (!markerMovedRef.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
  }, [postalCode, setValue]);

  // Reverse-geocode map position
  useEffect(() => {
    if (lastEditedRef.current !== "map" || !coords) return;
    const t = window.setTimeout(async () => {
      const r = await reverseGeocodeAddress(coords);
      if (r.city) setValue("city", r.city, { shouldValidate: false });
      if (r.postal_code && /^\d{4}$/.test(r.postal_code)) {
        setValue("postal_code", r.postal_code, { shouldValidate: false });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [coords, setValue]);

  function resetLocationMethod() {
    setLocationMethod(null);
    setCoords(null);
    setValue("postal_code", "");
    setValue("city", "");
    markerMovedRef.current = false;
    lastEditedRef.current = null;
  }

  function switchToPostal() {
    setCoords(null);
    setValue("postal_code", "");
    setValue("city", "");
    markerMovedRef.current = false;
    lastEditedRef.current = null;
    setLocationMethod("postal");
  }

  function switchToGps() {
    setValue("postal_code", "");
    setValue("city", "");
    markerMovedRef.current = false;
    lastEditedRef.current = null;
    void fetchMyLocation();
  }

  async function fetchMyLocation() {
    setLocationMethod("gps");
    setLocationLoading(true);
    try {
      if (isNative()) {
        const permission = await requestLocationPermission();
        if (permission !== "granted") {
          showErrorToast("Gi appen tilgang til posisjon i innstillingene.");
          setLocationMethod(null);
          return;
        }
      }
      const pos = await getCurrentPosition();
      if (!pos) {
        showErrorToast("Kunne ikke hente posisjon.");
        setLocationMethod(null);
        return;
      }
      const { lat, lng } = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords({ lat, lng });
      markerMovedRef.current = false;
      lastEditedRef.current = null;
      const geo = await reverseGeocodeAddress({ lat, lng });
      if (geo.city) setValue("city", geo.city, { shouldValidate: false });
      if (geo.postal_code && /^\d{4}$/.test(geo.postal_code)) {
        setValue("postal_code", geo.postal_code, { shouldValidate: false });
      }
    } catch {
      showErrorToast("Kunne ikke hente posisjon. Sjekk at du har gitt tilgang.");
      setLocationMethod(null);
    } finally {
      setLocationLoading(false);
    }
  }

  return {
    locationLoading,
    locationMethod,
    setLocationMethod,
    fullscreenMapOpen,
    setFullscreenMapOpen,
    coords,
    setCoords,
    lastEditedRef,
    markerMovedRef,
    resetLocationMethod,
    switchToPostal,
    switchToGps,
    fetchMyLocation,
  };
}
