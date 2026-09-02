import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImagePlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import type {
  BusinessLocation,
  BusinessOrganization,
} from "@/features/business-account/use-business-membership";
import {
  createOrganizationLocation,
  updateBusinessProfile,
  updateOrganizationBillingEmail,
  updateOrganizationLocation,
} from "@/lib/business.functions";
import {
  ORGANIZATION_LOGOS_BUCKET,
  deletePreviousOrganizationLogo,
  uploadOrganizationLogo,
  validateAvatarImage,
  describeImageError,
} from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

const PALETTES = [
  { id: "forest", label: "Skog", swatch: "oklch(0.35 0.06 160)" },
  { id: "navy", label: "Marineblå", swatch: "oklch(0.32 0.08 250)" },
  { id: "burgundy", label: "Burgunder", swatch: "oklch(0.34 0.09 20)" },
  { id: "slate", label: "Skifer", swatch: "oklch(0.32 0.02 250)" },
] as const;

type Props = {
  organization: BusinessOrganization;
  locations: BusinessLocation[];
  billingProfile?: {
    billing_email: string;
    address_line: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
};

type LocationFormState = {
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
};
type FormState = {
  displayName: string;
  websiteUrl: string;
  brandPalette: (typeof PALETTES)[number]["id"];
};

function initialState(organization: BusinessOrganization): FormState {
  return {
    displayName: organization.display_name,
    websiteUrl: organization.website_url ?? "",
    brandPalette: organization.brand_palette ?? "forest",
  };
}

export function BusinessProfileForm({ organization, locations, billingProfile }: Props) {
  const queryClient = useQueryClient();
  const canBrand = hasEffectiveProffAccess(organization);
  const canManageLocations = Boolean(billingProfile);
  const [form, setForm] = useState(() => initialState(organization));
  const [billingEmail, setBillingEmail] = useState(billingProfile?.billing_email ?? "");
  const [locationForm, setLocationForm] = useState<LocationFormState>({
    name: "",
    addressLine: "",
    postalCode: "",
    city: "",
  });
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const callUpdate = useServerFn(updateBusinessProfile);
  const callUpdateBilling = useServerFn(updateOrganizationBillingEmail);
  const callCreateLocation = useServerFn(createOrganizationLocation);
  const callUpdateLocation = useServerFn(updateOrganizationLocation);
  const logoUrl = useMemo(() => {
    if (!canBrand || !organization.logo_path) return null;
    return supabase.storage.from(ORGANIZATION_LOGOS_BUCKET).getPublicUrl(organization.logo_path)
      .data.publicUrl;
  }, [canBrand, organization.logo_path]);

  const mutation = useMutation({
    mutationFn: async () => {
      setValidationError(null);
      setSaved(false);
      const displayName = form.displayName.trim();
      if (displayName.length < 2 || displayName.length > 120) {
        throw new Error("Visningsnavnet må være mellom 2 og 120 tegn.");
      }
      let websiteUrl: string | undefined;
      if (canBrand) {
        websiteUrl = form.websiteUrl.trim();
        if (websiteUrl && !/^https:\/\/[^\s]+$/iu.test(websiteUrl)) {
          throw new Error("Nettsiden må være en absolutt https://-adresse.");
        }
      }

      const previousLogoPath = organization.logo_path;
      let logoPath: string | undefined;
      if (canBrand && logoFile) {
        const imageError = validateAvatarImage(logoFile);
        if (imageError) throw new Error(describeImageError(imageError));
        logoPath = await uploadOrganizationLogo({
          organizationId: organization.id,
          file: logoFile,
        });
      }

      const updated = await callUpdate({
        data: {
          displayName,
          ...(canBrand
            ? {
                websiteUrl: websiteUrl || null,
                brandPalette: form.brandPalette,
                ...(logoPath ? { logoPath } : {}),
              }
            : {}),
        },
      });
      if (logoPath && previousLogoPath && logoPath !== previousLogoPath) {
        await deletePreviousOrganizationLogo(previousLogoPath);
      }
      return updated;
    },
    onSuccess: async () => {
      setLogoFile(null);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
    onError: (error: Error) => setValidationError(error.message),
  });

  const locationMutation = useMutation({
    mutationFn: () =>
      editingLocationId
        ? callUpdateLocation({ data: { ...locationForm, locationId: editingLocationId } })
        : callCreateLocation({ data: locationForm }),
    onSuccess: async () => {
      setLocationForm({ name: "", addressLine: "", postalCode: "", city: "" });
      setEditingLocationId(null);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
    onError: (error: Error) => setValidationError(error.message),
  });
  const billingMutation = useMutation({
    mutationFn: () => callUpdateBilling({ data: { billingEmail } }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
    onError: (error: Error) => setValidationError(error.message),
  });
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  return (
    <section aria-labelledby="business-profile-title" className="space-y-6">
      <div>
        <h2 id="business-profile-title" className="font-display text-2xl tracking-tight">
          Bedriftsprofil
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dette er informasjonen kjøpere ser på bedriftens annonser.
        </p>
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert>
          <Check className="size-4" />
          <AlertDescription>Bedriftsprofilen er lagret.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="business-display-name">Visningsnavn</Label>
          <Input
            id="business-display-name"
            required
            value={form.displayName}
            maxLength={120}
            onChange={(event) => setField("displayName", event.target.value)}
            aria-describedby="business-display-name-help"
          />
          <p id="business-display-name-help" className="text-xs text-muted-foreground">
            2–120 tegn. Juridisk navn og organisasjonsnummer kan ikke endres.
          </p>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="flex items-start justify-between gap-3">
            {locations.length > 1 && (
              <div>
                <h3 className="font-semibold">Lokasjoner</h3>
                <p className="text-sm text-muted-foreground">
                  Adressen velges per lokasjon og brukes på annonsene som opprettes der.
                </p>
              </div>
            )}
            {canManageLocations && (
              <div className="space-y-2 text-right">
                <p className="max-w-xs text-xs text-muted-foreground">
                  Ny lokasjon koster 249 kr per måned per lokasjon, ekskl. mva. Faktureres fra neste
                  fakturaperiode.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingLocationId("");
                    setLocationForm({ name: "", addressLine: "", postalCode: "", city: "" });
                  }}
                >
                  Ny lokasjon
                </Button>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {locations.map((location) => (
              <div key={location.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {location.name}
                    {location.is_default ? " · Standard" : ""}
                  </p>
                  {canManageLocations && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingLocationId(location.id);
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
                <p className="text-muted-foreground">
                  {[location.address_line, location.postal_code, location.city]
                    .filter(Boolean)
                    .join(", ") || "Adresse ikke registrert"}
                </p>
              </div>
            ))}
          </div>
        </div>
        {canManageLocations && editingLocationId !== null && (
          <div className="space-y-4 border-t border-border pt-5 sm:col-span-2">
            <div>
              <h3 className="font-semibold">
                {editingLocationId ? "Rediger lokasjon" : "Ny lokasjon"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Lokasjonen blir tilgjengelig i annonseoppretteren og for tildelte medlemmer.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["name", "Navn", "f.eks. Oslo butikk"],
                  ["addressLine", "Gateadresse", "Storgata 1"],
                  ["postalCode", "Postnummer", "0001"],
                  ["city", "Poststed", "Oslo"],
                ] as const
              ).map(([field, label, placeholder]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`location-${field}`}>{label}</Label>
                  <Input
                    id={`location-${field}`}
                    value={locationForm[field]}
                    placeholder={placeholder}
                    onChange={(event) =>
                      setLocationForm((previous) => ({
                        ...previous,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={locationMutation.isPending}
                onClick={() => locationMutation.mutate()}
              >
                {locationMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {locationMutation.isPending
                  ? "Lagrer…"
                  : editingLocationId
                    ? "Lagre lokasjon"
                    : "Opprett lokasjon"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditingLocationId(null)}>
                Avbryt
              </Button>
            </div>
          </div>
        )}
        {billingProfile && (
          <div className="space-y-4 border-t border-border pt-5 sm:col-span-2">
            <div>
              <h3 className="font-semibold">Fakturaprofil</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Brukes som mottaker for nye Proff-bestillinger. Adressen er hentet fra
                Brønnøysundregistrene.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="space-y-2">
                <Label htmlFor="business-billing-email">Faktura-e-post</Label>
                <Input
                  id="business-billing-email"
                  type="email"
                  value={billingEmail}
                  onChange={(event) => setBillingEmail(event.target.value)}
                />
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {[billingProfile.address_line, billingProfile.postal_code, billingProfile.city]
                    .filter(Boolean)
                    .join(", ") || "Fakturaadresse ikke registrert"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={billingMutation.isPending}
                  onClick={() => billingMutation.mutate()}
                >
                  {billingMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Lagre"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {canBrand ? (
          <div className="space-y-5 border-t border-border pt-5 sm:col-span-2">
            <div>
              <h3 className="font-semibold">Proff-profilering</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Profileringen vises på aktive annonser mens Proff-tilgangen er gyldig.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-website">Nettside (valgfritt)</Label>
              <Input
                id="business-website"
                type="url"
                value={form.websiteUrl}
                onChange={(event) => setField("websiteUrl", event.target.value)}
                aria-describedby="business-website-help"
              />
              <p id="business-website-help" className="text-xs text-muted-foreground">
                Må begynne med https://.
              </p>
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Farge på annonseheader</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PALETTES.map((palette) => (
                  <label
                    key={palette.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-ring ${form.brandPalette === palette.id ? "border-primary" : "border-border"}`}
                  >
                    <input
                      type="radio"
                      name="business-brand-palette"
                      value={palette.id}
                      checked={form.brandPalette === palette.id}
                      onChange={() => setField("brandPalette", palette.id)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="size-5 rounded-full border border-border"
                      style={{ backgroundColor: palette.swatch }}
                    />
                    {palette.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-3">
              <Label htmlFor="business-logo">Logo (valgfritt)</Label>
              <div className="flex flex-wrap items-center gap-4">
                {logoUrl && !logoFile && (
                  <img
                    src={logoUrl}
                    alt=""
                    className="size-16 rounded-lg border border-border object-contain"
                  />
                )}
                <label
                  htmlFor="business-logo"
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
                >
                  <ImagePlus className="size-4" />
                  {logoFile ? logoFile.name : "Velg logo"}
                </label>
                <input
                  id="business-logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG eller WebP, maks 5 MB.</p>
            </div>
          </div>
        ) : (
          <p className="border-t border-border pt-5 text-sm text-muted-foreground sm:col-span-2">
            Logo, farger og nettside blir tilgjengelig med Proff. Lagrede opplysninger beholdes når
            prøveperioden utløper.
          </p>
        )}

        <div className="sm:col-span-2">
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {mutation.isPending ? "Lagrer…" : "Lagre bedriftsprofil"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            {mutation.isPending ? "Lagrer endringene…" : saved ? "Endringene er lagret." : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
