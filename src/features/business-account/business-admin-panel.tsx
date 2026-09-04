import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MapPin, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  BusinessLocation,
  BusinessMembership,
} from "@/features/business-account/use-business-membership";
import {
  createOrganizationLocation,
  updateOrganizationBillingEmail,
  updateOrganizationLocation,
} from "@/lib/business.functions";
import { formatErrorMessage } from "@/lib/errors";
import {
  LOCATION_FIELDS,
  validateLocation,
  type LocationErrors,
  type LocationFormState,
} from "@/features/business-account/location-form";

function PanelSection({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-6 px-5 py-5 sm:px-6">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-5 py-3 sm:px-6">
          {footer}
        </div>
      )}
    </section>
  );
}

function SaveState({ pending, saved }: { pending: boolean; saved: boolean }) {
  return (
    <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
      {pending ? (
        "Lagrer endringene…"
      ) : saved ? (
        <span className="inline-flex items-center gap-1.5 text-brand-text">
          <Check className="size-4" aria-hidden="true" />
          Lagret
        </span>
      ) : (
        ""
      )}
    </p>
  );
}

type Props = {
  locations: BusinessLocation[];
  billingProfile: BusinessMembership["billingProfile"];
};

export function BusinessAdminPanel({ locations, billingProfile }: Props) {
  const queryClient = useQueryClient();
  const canManageLocations = Boolean(billingProfile);
  const [billingEmail, setBillingEmail] = useState(billingProfile?.billing_email ?? "");
  const [locationForm, setLocationForm] = useState<LocationFormState>({
    name: "",
    addressLine: "",
    postalCode: "",
    city: "",
  });
  const [locationErrors, setLocationErrors] = useState<LocationErrors>({});
  const [acceptedLocationTerms, setAcceptedLocationTerms] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const callUpdateBilling = useServerFn(updateOrganizationBillingEmail);
  const callCreateLocation = useServerFn(createOrganizationLocation);
  const callUpdateLocation = useServerFn(updateOrganizationLocation);

  const locationMutation = useMutation({
    mutationFn: () => {
      const trimmed: LocationFormState = {
        name: locationForm.name.trim(),
        addressLine: locationForm.addressLine.trim(),
        postalCode: locationForm.postalCode.trim(),
        city: locationForm.city.trim(),
      };
      return editingLocationId
        ? callUpdateLocation({ data: { ...trimmed, locationId: editingLocationId } })
        : callCreateLocation({ data: trimmed });
    },
    onSuccess: async () => {
      setLocationForm({ name: "", addressLine: "", postalCode: "", city: "" });
      setLocationErrors({});
      setAcceptedLocationTerms(false);
      setEditingLocationId(null);
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
  });
  const billingMutation = useMutation({
    mutationFn: () => callUpdateBilling({ data: { billingEmail } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
  });

  return (
    <section aria-labelledby="business-admin-title" className="space-y-6">
      <div className="max-w-xl">
        <h2 id="business-admin-title" className="font-display text-3xl tracking-tight">
          Administrer bedrift
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Administrer lokasjoner og fakturainformasjon for bedriften.
        </p>
      </div>

      <PanelSection
        title="Lokasjoner"
        description="Adressen velges per lokasjon og brukes på annonsene som opprettes der."
        footer={
          canManageLocations ? (
            <>
              <p className="text-xs text-muted-foreground">
                Ny lokasjon koster 249 kr per måned per lokasjon, ekskl. mva. Faktureres fra neste
                fakturaperiode.
              </p>
              <SaveState pending={locationMutation.isPending} saved={locationMutation.isSuccess} />
            </>
          ) : undefined
        }
      >
        {locationMutation.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {formatErrorMessage(
                locationMutation.error,
                "Kunne ikke lagre lokasjonen. Prøv igjen.",
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="divide-y divide-border rounded-lg border border-border">
          {locations.map((location) => (
            <div
              key={location.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-start gap-3">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-medium">
                    {location.name}
                    {location.is_default ? " · Standard" : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {[location.address_line, location.postal_code, location.city]
                      .filter(Boolean)
                      .join(", ") || "Adresse ikke registrert"}
                  </p>
                </div>
              </div>
              {canManageLocations && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingLocationId(location.id);
                    setLocationErrors({});
                    setAcceptedLocationTerms(false);
                    setLocationForm({
                      name: location.name,
                      addressLine: location.address_line ?? "",
                      postalCode: location.postal_code ?? "",
                      city: location.city ?? "",
                    });
                  }}
                >
                  Rediger
                </Button>
              )}
            </div>
          ))}
        </div>

        {canManageLocations &&
          (editingLocationId === null ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingLocationId("");
                setLocationForm({ name: "", addressLine: "", postalCode: "", city: "" });
                setLocationErrors({});
                setAcceptedLocationTerms(false);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Ny lokasjon
            </Button>
          ) : (
            <div className="space-y-4 rounded-lg bg-muted/40 p-4 sm:p-5">
              <div>
                <h4 className="font-semibold">
                  {editingLocationId ? "Rediger lokasjon" : "Ny lokasjon"}
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Lokasjonen blir tilgjengelig i annonseoppretteren og for tildelte medlemmer. Alle
                  felt er påkrevd.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {LOCATION_FIELDS.map(([field, label, placeholder]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={`location-${field}`}>
                      {label}{" "}
                      <span className="text-destructive" aria-hidden="true">
                        *
                      </span>
                    </Label>
                    <Input
                      id={`location-${field}`}
                      required
                      inputMode={field === "postalCode" ? "numeric" : undefined}
                      value={locationForm[field]}
                      placeholder={placeholder}
                      aria-invalid={Boolean(locationErrors[field])}
                      aria-describedby={
                        locationErrors[field] ? `location-${field}-error` : undefined
                      }
                      onChange={(event) => {
                        const { value } = event.target;
                        setLocationForm((previous) => ({ ...previous, [field]: value }));
                        setLocationErrors((previous) => ({ ...previous, [field]: undefined }));
                      }}
                    />
                    {locationErrors[field] && (
                      <p id={`location-${field}-error`} className="text-sm text-destructive">
                        {locationErrors[field]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {!editingLocationId && (
                <div className="space-y-1.5 border-t border-border pt-4">
                  <label className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      id="location-accept-terms"
                      checked={acceptedLocationTerms}
                      required
                      onCheckedChange={(value) => {
                        setAcceptedLocationTerms(value === true);
                        setLocationErrors((previous) => ({ ...previous, terms: undefined }));
                      }}
                      aria-invalid={Boolean(locationErrors.terms)}
                      aria-describedby={
                        locationErrors.terms ? "location-terms-error" : "location-terms-help"
                      }
                      className="mt-0.5"
                    />
                    <span id="location-terms-help">
                      Jeg godtar å bli fakturert med{" "}
                      <span className="font-medium text-foreground">
                        249 kr per måned, ekskl. mva.
                      </span>
                      , fra neste fakturaperiode for opprettelse av en ny lokasjon, og bekrefter at
                      jeg har lest og godtar{" "}
                      <a
                        href="/vilkar"
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground underline"
                      >
                        brukervilkårene
                      </a>
                      .
                    </span>
                  </label>
                  {locationErrors.terms && (
                    <p id="location-terms-error" className="text-sm text-destructive">
                      {locationErrors.terms}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={locationMutation.isPending}
                  onClick={() => {
                    const errors = validateLocation(locationForm, {
                      requireConsent: !editingLocationId,
                      accepted: acceptedLocationTerms,
                    });
                    setLocationErrors(errors);
                    if (Object.keys(errors).length === 0) locationMutation.mutate();
                  }}
                >
                  {locationMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  {locationMutation.isPending
                    ? "Lagrer…"
                    : editingLocationId
                      ? "Lagre lokasjon"
                      : "Opprett lokasjon"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingLocationId(null);
                    setLocationErrors({});
                    setAcceptedLocationTerms(false);
                  }}
                >
                  Avbryt
                </Button>
              </div>
            </div>
          ))}
      </PanelSection>

      {billingProfile && (
        <PanelSection
          title="Fakturaprofil"
          description="Brukes som mottaker for nye Proff-bestillinger. Adressen er hentet fra Brønnøysundregistrene."
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={billingMutation.isPending}
                onClick={() => billingMutation.mutate()}
              >
                {billingMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {billingMutation.isPending ? "Lagrer…" : "Lagre fakturaprofil"}
              </Button>
              <SaveState pending={billingMutation.isPending} saved={billingMutation.isSuccess} />
            </>
          }
        >
          {billingMutation.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {formatErrorMessage(
                  billingMutation.error,
                  "Kunne ikke lagre fakturaprofilen. Prøv igjen.",
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-billing-email">Faktura-e-post</Label>
              <Input
                id="business-billing-email"
                type="email"
                value={billingEmail}
                onChange={(event) => setBillingEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Fakturaadresse</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {[billingProfile.address_line, billingProfile.postal_code, billingProfile.city]
                  .filter(Boolean)
                  .join(", ") || "Fakturaadresse ikke registrert"}
              </p>
            </div>
          </div>
        </PanelSection>
      )}
    </section>
  );
}
