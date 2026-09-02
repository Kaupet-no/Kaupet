import { lazy, Suspense, useEffect } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hash, Loader2, LocateFixed, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBusinessMembership } from "@/features/business-account/use-business-membership";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";

const ListingLocationPicker = lazy(() =>
  import("@/components/listing-location-picker").then((m) => ({
    default: m.ListingLocationPicker,
  })),
);

function ClientLocationPicker(props: {
  lat: number;
  lng: number;
  onChange: (next: { lat: number; lng: number }) => void;
  readOnly?: boolean;
}) {
  const fallback = <Skeleton className="h-52 w-full rounded-2xl" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <ListingLocationPicker {...props} />
      </Suspense>
    </ClientOnly>
  );
}

/** Delivery-method buttons + location section (GPS/postal/map). Identical on web and native. */
export function DeliveryLocation({
  native,
  behavior,
  canShip,
  setValue,
  locationMethod,
  setLocationMethod,
  fetchMyLocation,
  locationLoading,
  coords,
  setCoords,
  postalCode,
  city,
  switchToPostal,
  switchToGps,
  setFullscreenMapOpen,
  markerMovedRef,
  lastEditedRef,
  errors,
  register,
  showDelivery = true,
  showLocation = true,
}: WizardSharedProps & { showDelivery?: boolean; showLocation?: boolean }) {
  return (
    <>
      {showDelivery && behavior.requiresDeliveryMethod && (
        <section className="space-y-3">
          <Label id="delivery-label">
            Levering
            <RequiredMark />
          </Label>
          <div
            role="radiogroup"
            aria-labelledby="delivery-label"
            aria-required="true"
            className="grid grid-cols-3 gap-2"
          >
            {(
              [
                { value: "pickup", label: "Må hentes", description: "Kjøper henter selv" },
                { value: "ship", label: "Må sendes", description: "Selger sender" },
                {
                  value: "both",
                  label: "Begge deler",
                  description: "Kan både hentes og sendes",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={canShip === opt.value}
                onClick={() => setValue("can_ship", opt.value, { shouldValidate: true })}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 text-center text-sm transition-colors ${
                  canShip === opt.value
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {showLocation && (
        <section className="space-y-4">
          <Label>
            Sted
            <RequiredMark />
          </Label>
          {locationMethod === null && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void fetchMyLocation()}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-accent active:scale-95"
              >
                <LocateFixed className="size-6 text-primary" />
                <span className="text-sm font-medium">Bruk min posisjon</span>
              </button>
              <button
                type="button"
                onClick={() => setLocationMethod("postal")}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-accent active:scale-95"
              >
                <Hash className="size-6 text-primary" />
                <span className="text-sm font-medium">Skriv inn postnummer</span>
              </button>
            </div>
          )}
          {locationMethod === "gps" && (
            <div className="space-y-3">
              {locationLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" />
                  Henter posisjon…
                </div>
              ) : coords ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <MapPin className="mr-1 inline size-3.5" />
                    {[postalCode, city].filter(Boolean).join(" ") || "Posisjon funnet"}
                  </p>
                  <button
                    type="button"
                    onClick={switchToPostal}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Benytt postnummer isteden
                  </button>
                </div>
              ) : null}
              {coords && (
                <div className="space-y-2">
                  {native ? (
                    <div
                      className="relative cursor-pointer"
                      onClick={() => setFullscreenMapOpen(true)}
                    >
                      <ClientLocationPicker
                        lat={coords.lat}
                        lng={coords.lng}
                        onChange={() => {}}
                        readOnly
                      />
                      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                        <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
                          Trykk for å justere lokasjonen på annonsen
                        </span>
                      </div>
                    </div>
                  ) : (
                    <ClientLocationPicker
                      lat={coords.lat}
                      lng={coords.lng}
                      onChange={(next) => {
                        markerMovedRef.current = true;
                        lastEditedRef.current = "map";
                        setCoords(next);
                      }}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Denne lokasjonen vises på annonsen din. Bare omtrentlig posisjon er synlig for
                    andre.
                  </p>
                </div>
              )}
            </div>
          )}
          {locationMethod === "postal" && (
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="w-36 space-y-2">
                  <Label htmlFor="postal_code">Postnummer</Label>
                  <Input
                    id="postal_code"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0150"
                    aria-required="true"
                    aria-invalid={!!errors.postal_code}
                    aria-describedby={errors.postal_code ? "postal-code-error" : undefined}
                    {...register("postal_code", {
                      onChange: () => {
                        lastEditedRef.current = "postal_code";
                        markerMovedRef.current = false;
                      },
                    })}
                  />
                  {errors.postal_code && (
                    <p id="postal-code-error" className="text-sm text-destructive">
                      {errors.postal_code.message}
                    </p>
                  )}
                </div>
                {city && <p className="pb-2 text-sm text-muted-foreground">{city}</p>}
                <button
                  type="button"
                  onClick={switchToGps}
                  className="mb-2 ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Bruk min posisjon isteden
                </button>
              </div>
              {coords && (
                <div className="space-y-2">
                  {native ? (
                    <div
                      className="relative cursor-pointer"
                      onClick={() => setFullscreenMapOpen(true)}
                    >
                      <ClientLocationPicker
                        lat={coords.lat}
                        lng={coords.lng}
                        onChange={() => {}}
                        readOnly
                      />
                      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                        <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
                          Trykk for å justere lokasjonen på annonsen
                        </span>
                      </div>
                    </div>
                  ) : (
                    <ClientLocationPicker
                      lat={coords.lat}
                      lng={coords.lng}
                      onChange={(next) => {
                        markerMovedRef.current = true;
                        lastEditedRef.current = "map";
                        setCoords(next);
                      }}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Denne lokasjonen vises på annonsen din. Bare omtrentlig posisjon er synlig for
                    andre.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}

export function DeliveryGroup(props: WizardSharedProps) {
  if (!props.behavior.requiresDeliveryMethod) return null;
  return <DeliveryLocation {...props} showLocation={false} />;
}

export function LocationGroup(props: WizardSharedProps) {
  const { setValue } = props;
  const { data: membership } = useBusinessMembership();
  const selectedLocationId = props.watch("organization_location_id") ?? "";
  const locations = membership?.status === "active" ? membership.locations : [];
  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) ??
    locations.find((location) => location.is_default) ??
    locations[0];

  useEffect(() => {
    if (membership?.status !== "active" || !selectedLocation || selectedLocationId) return;
    setValue("organization_location_id", selectedLocation.id, { shouldDirty: false });
  }, [membership?.status, setValue, selectedLocation, selectedLocationId]);

  if (membership?.status === "active") {
    return (
      <section className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="organization-location">Lokasjon</Label>
          <Select
            value={selectedLocationId || selectedLocation?.id || ""}
            onValueChange={(value) =>
              props.setValue("organization_location_id", value, { shouldValidate: true })
            }
          >
            <SelectTrigger id="organization-location">
              <SelectValue placeholder="Velg lokasjon" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedLocation && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">{selectedLocation.name}</p>
              <p className="text-muted-foreground">
                {[
                  selectedLocation.address_line,
                  selectedLocation.postal_code,
                  selectedLocation.city,
                ]
                  .filter(Boolean)
                  .join(", ") || "Adresse ikke registrert"}
              </p>
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={props.watch("show_visiting_address") ?? false}
            onCheckedChange={(checked) =>
              props.setValue("show_visiting_address", checked === true, { shouldDirty: true })
            }
          />
          Vis full besøksadresse på annonsen
        </label>
      </section>
    );
  }
  return <DeliveryLocation {...props} showDelivery={false} />;
}
