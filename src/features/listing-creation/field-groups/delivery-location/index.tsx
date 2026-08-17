import { Hash, Loader2, LocateFixed, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListingLocationPicker } from "@/components/listing-location-picker";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";

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
          <Label>
            Levering
            <RequiredMark />
          </Label>
          <div className="grid grid-cols-3 gap-2">
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
                onClick={() => setValue("can_ship", opt.value, { shouldValidate: true })}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center text-sm transition-colors ${
                  canShip === opt.value
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5"
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                      <ListingLocationPicker
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
                    <ListingLocationPicker
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
                      <ListingLocationPicker
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
                    <ListingLocationPicker
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
  return <DeliveryLocation {...props} showDelivery={false} />;
}
