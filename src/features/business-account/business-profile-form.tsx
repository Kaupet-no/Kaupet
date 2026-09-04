import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImagePlus, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProffListingHeader } from "@/components/listing-detail/proff-listing-presentation";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { updateBusinessProfile } from "@/lib/business.functions";
import { compressImage } from "@/lib/image-compression";
import {
  IMAGE_ACCEPT,
  ORGANIZATION_LOGOS_BUCKET,
  deletePreviousOrganizationLogo,
  uploadOrganizationLogo,
  validateAvatarImage,
  describeImageError,
} from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { formatErrorMessage } from "@/lib/errors";
import {
  BRAND_PALETTES,
  DEFAULT_BRAND_PALETTE,
  isHexBrandColor,
  normalizeHexColor,
} from "@/lib/brand-color";
import {
  PROFF_LISTING_CONCEPTS,
  PROFF_LISTING_CONCEPT_LABELS,
  PROFF_LISTING_FONTS,
  PROFF_LISTING_FONT_FAMILIES,
  PROFF_LISTING_FONT_LABELS,
  PROFF_LISTING_OVERTITLES,
  PROFF_LISTING_OVERTITLE_LABELS,
  type ProffListingConcept,
  type ProffListingFont,
  type ProffListingOvertitle,
} from "@/components/listing-detail/proff-listing-types";

/** Startfargen i fargevelgeren når bedriften ikke har en egendefinert farge
 * fra før — `<input type="color">` godtar bare hex. */
const CUSTOM_COLOR_FALLBACK = "#2f5d50";

type Props = {
  organization: BusinessOrganization;
};

type FormState = {
  displayName: string;
  websiteUrl: string;
  /** Palett-ID eller egendefinert «#rrggbb». */
  brandPalette: string;
  listingConcept: ProffListingConcept;
  listingFont: ProffListingFont;
  listingOvertitle: ProffListingOvertitle;
};

function initialState(organization: BusinessOrganization): FormState {
  return {
    displayName: organization.display_name,
    websiteUrl: organization.website_url ?? "",
    brandPalette: organization.brand_palette ?? DEFAULT_BRAND_PALETTE,
    listingConcept: organization.listing_concept,
    listingFont: organization.listing_font,
    listingOvertitle: organization.listing_overtitle,
  };
}

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

export function BusinessProfileForm({ organization }: Props) {
  const queryClient = useQueryClient();
  const canBrand = hasEffectiveProffAccess(organization);
  const [form, setForm] = useState(() => initialState(organization));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [hexDraft, setHexDraft] = useState(() =>
    isHexBrandColor(organization.brand_palette) ? organization.brand_palette : "",
  );
  const callUpdate = useServerFn(updateBusinessProfile);
  const logoUrl = useMemo(() => {
    if (!canBrand || !organization.logo_path) return null;
    return supabase.storage.from(ORGANIZATION_LOGOS_BUCKET).getPublicUrl(organization.logo_path)
      .data.publicUrl;
  }, [canBrand, organization.logo_path]);
  const pendingLogoUrl = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  );
  useEffect(() => {
    if (pendingLogoUrl) return () => URL.revokeObjectURL(pendingLogoUrl);
  }, [pendingLogoUrl]);

  const mutation = useMutation({
    mutationFn: async () => {
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

      if (canBrand && hexDraft.trim() && !normalizeHexColor(hexDraft)) {
        throw new Error("Fargekoden må være en gyldig hex-farge, for eksempel #1a2b3c.");
      }

      const previousLogoPath = organization.logo_path;
      let logoPath: string | undefined;
      if (canBrand && logoFile) {
        const compressedLogo = await compressImage(logoFile, "avatar");
        const imageError = validateAvatarImage(compressedLogo);
        if (imageError) throw new Error(describeImageError(imageError));
        logoPath = await uploadOrganizationLogo({
          organizationId: organization.id,
          file: compressedLogo,
        });
      }

      const updated = await callUpdate({
        data: {
          displayName,
          ...(canBrand
            ? {
                websiteUrl: websiteUrl || null,
                brandPalette: form.brandPalette,
                listingConcept: form.listingConcept,
                listingFont: form.listingFont,
                listingOvertitle: form.listingOvertitle,
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
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
  });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const previewLogo = pendingLogoUrl ?? logoUrl;
  const customColorActive = isHexBrandColor(form.brandPalette);
  const colorPickerValue = normalizeHexColor(hexDraft) ?? CUSTOM_COLOR_FALLBACK;
  const selectCustomColor = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHexColor(value);
    if (normalized) setField("brandPalette", normalized);
  };

  return (
    <section aria-labelledby="business-profile-title" className="space-y-6">
      <div className="max-w-xl">
        <h2 id="business-profile-title" className="font-display text-3xl tracking-tight">
          Bedriftsprofil
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Dette er informasjonen kjøpere ser på bedriftens annonser. Gjør det enkelt å vite hvem de
          handler med.
        </p>
      </div>

      <PanelSection
        title="Profil på annonsene"
        description="Navn, nettside og profilering slik kjøperne møter den øverst på hver annonse."
        footer={
          <>
            <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {mutation.isPending ? "Lagrer…" : "Lagre profil"}
            </Button>
            <SaveState pending={mutation.isPending} saved={mutation.isSuccess} />
          </>
        }
      >
        {mutation.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {formatErrorMessage(mutation.error, "Kunne ikke lagre profilen. Prøv igjen.")}
            </AlertDescription>
          </Alert>
        )}

        {canBrand && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Forhåndsvisning av bedriftsprofil
            </p>
            <div className="rounded-xl border border-border bg-surface p-3">
              <ProffListingHeader
                organization={{
                  id: organization.id,
                  displayName: form.displayName.trim() || organization.legal_name,
                  organizationNumber: organization.organization_number,
                  logoUrl: previewLogo,
                  websiteUrl: form.websiteUrl.trim() || null,
                  palette: form.brandPalette,
                  concept: form.listingConcept,
                  font: form.listingFont,
                  overtitle: form.listingOvertitle,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Endringer vises her med én gang og gjelder alle nye og aktive annonser.
            </p>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
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
              2–120 tegn. Dette endrer kun navnet som vises i annonser. Juridisk navn og
              organisasjonsnummer kan ikke endres.
            </p>
          </div>
          {canBrand && (
            <div className="space-y-2">
              <Label htmlFor="business-website">Nettside (valgfritt)</Label>
              <Input
                id="business-website"
                type="url"
                value={form.websiteUrl}
                placeholder="https://"
                onChange={(event) => setField("websiteUrl", event.target.value)}
                aria-describedby="business-website-help"
              />
              <p id="business-website-help" className="text-xs text-muted-foreground">
                Må begynne med https://.
              </p>
            </div>
          )}
        </div>

        {canBrand ? (
          <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Farge på annonseheader</legend>
              <div className="grid grid-cols-2 gap-2">
                {BRAND_PALETTES.map((palette) => (
                  <label
                    key={palette.id}
                    className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
                      form.brandPalette === palette.id
                        ? "border-primary bg-primary/[0.06] font-medium"
                        : "border-border hover:bg-muted/50"
                    }`}
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
                      className="size-5 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: palette.background }}
                    />
                    {palette.label}
                  </label>
                ))}
              </div>
              <div
                className={`space-y-3 rounded-lg border p-3 transition-colors ${
                  customColorActive ? "border-primary bg-primary/[0.06]" : "border-border"
                }`}
              >
                <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="radio"
                    name="business-brand-palette"
                    value="custom"
                    checked={customColorActive}
                    onChange={() => selectCustomColor(hexDraft || CUSTOM_COLOR_FALLBACK)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="size-5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: colorPickerValue }}
                  />
                  <span className={customColorActive ? "font-medium" : ""}>Egen farge</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="business-brand-color-picker"
                    type="color"
                    value={colorPickerValue}
                    onChange={(event) => selectCustomColor(event.target.value)}
                    aria-label="Velg egen farge"
                    className="size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="business-brand-hex" className="sr-only">
                      Fargekode (hex)
                    </Label>
                    <Input
                      id="business-brand-hex"
                      value={hexDraft}
                      maxLength={7}
                      placeholder="#1a2b3c"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => selectCustomColor(event.target.value)}
                      aria-invalid={Boolean(hexDraft.trim() && !normalizeHexColor(hexDraft))}
                      aria-describedby="business-brand-hex-help"
                    />
                  </div>
                </div>
                <p
                  id="business-brand-hex-help"
                  className={`text-xs ${
                    hexDraft.trim() && !normalizeHexColor(hexDraft)
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {hexDraft.trim() && !normalizeHexColor(hexDraft)
                    ? "Ugyldig fargekode. Bruk formatet #1a2b3c."
                    : "Skriv inn en hex-kode, eller velg farge i fargevelgeren. Tekstfargen justeres automatisk for lesbarhet."}
                </p>
              </div>
            </fieldset>
            <div className="space-y-3">
              <Label htmlFor="business-logo">Logo (valgfritt)</Label>
              <div className="flex items-center gap-3">
                {previewLogo && (
                  <img
                    src={previewLogo}
                    alt=""
                    className="size-12 shrink-0 rounded-lg border border-border object-contain"
                  />
                )}
                <label
                  htmlFor="business-logo"
                  className="inline-flex min-h-12 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <ImagePlus className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{logoFile ? logoFile.name : "Velg logo"}</span>
                </label>
                <input
                  id="business-logo"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="sr-only"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG eller WebP, maks 5 MB.</p>
            </div>
            <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Stil på annonsen</legend>
                <div className="grid gap-2">
                  {PROFF_LISTING_CONCEPTS.map((value) => (
                    <label
                      key={value}
                      className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                        form.listingConcept === value
                          ? "border-primary bg-primary/[0.06] font-medium"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="business-listing-concept"
                        value={value}
                        checked={form.listingConcept === value}
                        onChange={() => setField("listingConcept", value)}
                        className="sr-only"
                      />
                      {PROFF_LISTING_CONCEPT_LABELS[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Font for bedriftsnavnet</legend>
                <div className="grid gap-2">
                  {PROFF_LISTING_FONTS.map((value) => (
                    <label
                      key={value}
                      className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                        form.listingFont === value
                          ? "border-primary bg-primary/[0.06] font-medium"
                          : "border-border hover:bg-muted/50"
                      }`}
                      style={{ fontFamily: PROFF_LISTING_FONT_FAMILIES[value] }}
                    >
                      <input
                        type="radio"
                        name="business-listing-font"
                        value={value}
                        checked={form.listingFont === value}
                        onChange={() => setField("listingFont", value)}
                        className="sr-only"
                      />
                      {PROFF_LISTING_FONT_LABELS[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-3 sm:col-span-2">
                <legend className="text-sm font-medium">Overtittel på annonsen</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PROFF_LISTING_OVERTITLES.map((value) => (
                    <label
                      key={value}
                      className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                        form.listingOvertitle === value
                          ? "border-primary bg-primary/[0.06] font-medium"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="business-listing-overtitle"
                        value={value}
                        checked={form.listingOvertitle === value}
                        onChange={() => setField("listingOvertitle", value)}
                        className="sr-only"
                      />
                      {PROFF_LISTING_OVERTITLE_LABELS[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 rounded-lg border border-dashed border-border p-4">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted-foreground">
              Logo, farger og nettside blir tilgjengelig med Proff. Lagrede opplysninger beholdes
              når prøveperioden utløper.
            </p>
          </div>
        )}
      </PanelSection>
    </section>
  );
}
