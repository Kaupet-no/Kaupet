import { useEffect, useRef, useState } from "react";
import { showErrorToast } from "@/lib/toast";
import { lookupPostalCode, lookupCity, reverseGeocodeAddress } from "@/lib/geocode";
import { getCurrentPosition, requestLocationPermission, isNative } from "@/lib/native";

type Coords = { lat: number; lng: number };

type EditableListingLocation = {
  id: string;
  lat: number | null;
  lng: number | null;
  postal_code: string | null;
  city: string | null;
};

/**
 * Owns the location step for the listing-edit page: hydrating coordinates
 * and the postal/GPS method choice from the existing listing, then the same
 * postal<->city<->map autofill behavior as the create wizard's
 * useLocationPicker — plus an extra city->postal-code autofill direction
 * that the create flow doesn't need (editing can start from a city with no
 * postal code already set). Pulled out of mine-annonser.$id.rediger.tsx.
 */
export function useEditLocationPicker(params: {
  listing: EditableListingLocation | undefined;
  postalCode: string | undefined;
  city: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any, options?: any) => void;
}) {
  const { listing, postalCode, city, setValue } = params;

  const [coords, setCoords] = useState<Coords | null>(null);
  const lastEditedRef = useRef<"postal_code" | "city" | "map" | null>(null);
  const markerMovedRef = useRef(false);
  const coordsHydratedFor = useRef<string | null>(null);
  const [locationMethod, setLocationMethod] = useState<"gps" | "postal" | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [fullscreenMapOpen, setFullscreenMapOpen] = useState(false);
  const locationMethodHydratedFor = useRef<string | null>(null);

  // Initialize coords from existing listing
  useEffect(() => {
    if (!listing || coordsHydratedFor.current === listing.id) return;
    coordsHydratedFor.current = listing.id;
    if (typeof listing.lat === "number" && typeof listing.lng === "number") {
      setCoords({ lat: listing.lat, lng: listing.lng });
    }
  }, [listing]);

  // Default the location method to "postal" for existing listings that already
  // have a postal code/city, so editing doesn't hide the already-filled-in
  // location fields behind the create-wizard's pick-a-method screen.
  useEffect(() => {
    if (!listing || locationMethodHydratedFor.current === listing.id) return;
    locationMethodHydratedFor.current = listing.id;
    if (listing.postal_code || listing.city) setLocationMethod("postal");
  }, [listing]);

  // Auto-fill city from postal code
  useEffect(() => {
    if (lastEditedRef.current !== "postal_code") return;
    const p = (postalCode ?? "").trim();
    // Clear the (possibly stale) city immediately so it never keeps showing
    // a place that doesn't match what's currently typed, even while the
    // lookup below is still in flight or ends up failing.
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

  // Auto-fill postal from city
  useEffect(() => {
    if (lastEditedRef.current !== "city") return;
    const c = (city ?? "").trim();
    if (c.length < 2) return;
    const t = window.setTimeout(async () => {
      const r = await lookupCity(c);
      if (!r) return;
      if (r.postal_code && !(postalCode ?? "").trim()) {
        setValue("postal_code", r.postal_code, { shouldValidate: false });
      }
      if (!markerMovedRef.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, setValue]);

  // Reverse-geocode map position back to city/postal
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
    coords,
    setCoords,
    lastEditedRef,
    markerMovedRef,
    locationMethod,
    setLocationMethod,
    locationLoading,
    fullscreenMapOpen,
    setFullscreenMapOpen,
    switchToPostal,
    switchToGps,
    fetchMyLocation,
  };
}
