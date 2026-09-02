import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImagePlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { updateBusinessProfile } from "@/lib/business.functions";
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

type Props = { organization: BusinessOrganization };

type FormState = {
  displayName: string;
  postalCode: string;
  city: string;
  websiteUrl: string;
  brandPalette: (typeof PALETTES)[number]["id"];
};

function initialState(organization: BusinessOrganization): FormState {
  return {
    displayName: organization.display_name,
    postalCode: organization.postal_code ?? "",
    city: organization.city ?? "",
    websiteUrl: organization.website_url ?? "",
    brandPalette: organization.brand_palette ?? "forest",
  };
}

export function BusinessProfileForm({ organization }: Props) {
  const queryClient = useQueryClient();
  const canBrand = hasEffectiveProffAccess(organization);
  const [form, setForm] = useState(() => initialState(organization));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const callUpdate = useServerFn(updateBusinessProfile);

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
      const postalCode = form.postalCode.trim();
      const city = form.city.trim();
      if (displayName.length < 2 || displayName.length > 120) {
        throw new Error("Visningsnavnet må være mellom 2 og 120 tegn.");
      }
      // Adressen er lokasjonen på hver annonse fra bedriften, så den kan ikke
      // stå tom lenger.
      if (!/^\d{4}$/u.test(postalCode)) {
        throw new Error("Postnummer må være fire siffer.");
      }
      if (city.length < 1 || city.length > 100) {
        throw new Error("By må være mellom 1 og 100 tegn.");
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
          postalCode,
          city,
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
        <div className="space-y-2 sm:col-span-2">
          <h3 className="font-semibold">Bedriftsadresse</h3>
          <p className="text-sm text-muted-foreground">
            Alle annonser fra bedriften bruker denne adressen som lokasjon — den settes ikke per
            annonse. Den er hentet fra Brønnøysundregistrene ved registrering, og kan endres her.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="business-postal-code">Postnummer</Label>
          <Input
            id="business-postal-code"
            required
            inputMode="numeric"
            maxLength={4}
            value={form.postalCode}
            onChange={(event) => setField("postalCode", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="business-city">Sted</Label>
          <Input
            id="business-city"
            required
            value={form.city}
            onChange={(event) => setField("city", event.target.value)}
          />
        </div>

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
