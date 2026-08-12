import { Loader2, MapPin } from "lucide-react";
import { Turnstile } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { WizardSharedProps } from "../types";

type ReviewPreviewProps = Pick<
  WizardSharedProps,
  "images" | "title" | "subtitle" | "previewPrice" | "city" | "postalCode" | "categoryLabel"
>;

/** Preview card showing how the listing will look in the search list. */
export function ReviewPreview({
  images,
  title,
  subtitle,
  previewPrice,
  city,
  postalCode,
  categoryLabel,
}: ReviewPreviewProps) {
  return (
    <section className="space-y-2">
      <Label>Forhåndsvisning</Label>
      <p className="text-xs text-muted-foreground">
        Dette er slik annonsen din vil se ut i søkelisten
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:max-w-[220px]">
        <div className="aspect-square bg-muted">
          {images[0] ? (
            <img src={images[0].previewUrl} alt="" className="size-full object-cover" aria-hidden />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <span className="text-2xl">📷</span>
              <span className="text-xs">Ingen bilde</span>
            </div>
          )}
        </div>
        <div className="space-y-0.5 p-3">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{title || "—"}</p>
          {subtitle && <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
          {previewPrice && <p className="font-display text-base font-semibold">{previewPrice}</p>}
          {(city || postalCode) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {city || postalCode}
            </p>
          )}
          {categoryLabel && (
            <p className="text-xs text-muted-foreground truncate">{categoryLabel}</p>
          )}
        </div>
      </div>
    </section>
  );
}

type UploadProgressProps = {
  mutationIsPending: boolean;
  uploadProgress: { done: number; total: number } | null;
};

/** Upload-progress indicator shown while the publish mutation is running. */
export function UploadProgress({ mutationIsPending, uploadProgress }: UploadProgressProps) {
  if (!mutationIsPending) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {uploadProgress
          ? `Laster opp bilde ${uploadProgress.done} av ${uploadProgress.total}…`
          : "Forbereder opplasting…"}
      </p>
      <Progress
        value={uploadProgress ? (uploadProgress.done / uploadProgress.total) * 100 : null}
        className={uploadProgress ? "" : "animate-pulse"}
      />
    </div>
  );
}

type PublishActionsProps = {
  native: boolean;
  turnstileEnabled: boolean;
  turnstileToken: string | null;
  setTurnstileToken: (token: string | null) => void;
  mutationIsPending: boolean;
  onCancel: () => void;
  onPreview: () => void;
};

/**
 * Registry-facing wrapper: ReviewPreview + UploadProgress. `PublishActions`
 * is deliberately excluded — it renders inline in the wizard's footer bar
 * next to "Tilbake" (not stacked above it), same as today, so ny-annonse.tsx
 * renders it explicitly on the last page instead of via this wrapper.
 */
export function ReviewPublishGroup(props: WizardSharedProps) {
  const missing: string[] = [];
  if (props.images.length === 0) missing.push("bilde");
  if (!props.previewPrice) missing.push("pris");

  return (
    <>
      {props.native && missing.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Kan forbedres før publisering</AlertTitle>
          <AlertDescription>
            Annonsen mangler {missing.join(" og ")}. Du kan fortsatt publisere, eller gå tilbake og
            legge det til.
          </AlertDescription>
        </Alert>
      )}
      <ReviewPreview
        images={props.images}
        title={props.title}
        subtitle={props.subtitle}
        previewPrice={props.previewPrice}
        city={props.city}
        postalCode={props.postalCode}
        categoryLabel={props.categoryLabel}
      />
      {props.attributes.vehicle_lookup && (
        <p className="text-xs text-muted-foreground">
          Du er ansvarlig for at opplysningene i annonsen stemmer. Kontroller at opplysningene
          stemmer før du publiserer annonsen.
        </p>
      )}
      <UploadProgress
        mutationIsPending={props.mutationIsPending}
        uploadProgress={props.uploadProgress}
      />
    </>
  );
}

/**
 * Turnstile + "Avbryt" + "Publiser annonse" submit button — shared verbatim.
 * Renders as flat siblings (not a wrapping div) so the caller's own
 * flex-wrap row controls line breaks: "Avbryt" can wrap up onto "Tilbake"s
 * line, while "Forhåndsvis annonse" + "Publiser annonse" are grouped in one
 * inner (non-wrapping) div so that pair always moves to a new line together
 * instead of splitting across two lines.
 */
export function PublishActions({
  native,
  turnstileEnabled,
  turnstileToken,
  setTurnstileToken,
  mutationIsPending,
  onCancel,
  onPreview,
}: PublishActionsProps) {
  if (native) {
    return (
      <div className="flex w-full items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onPreview}
          disabled={mutationIsPending}
          className="shrink-0 px-3"
        >
          Forhåndsvis
        </Button>
        {turnstileEnabled && (
          <Turnstile
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
            options={{ size: "invisible" }}
          />
        )}
        <Button
          type="submit"
          data-testid="publish-listing-button"
          disabled={mutationIsPending || (turnstileEnabled && !turnstileToken)}
          className="h-14 flex-1 rounded-xl text-base"
        >
          {mutationIsPending && <Loader2 className="size-4 animate-spin" />}
          Publiser
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={mutationIsPending}>
        Avbryt
      </Button>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={onPreview} disabled={mutationIsPending}>
          Forhåndsvis annonse
        </Button>
        {turnstileEnabled && (
          <Turnstile
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
            options={{ size: "invisible" }}
          />
        )}
        <Button
          type="submit"
          data-testid="publish-listing-button"
          disabled={mutationIsPending || (turnstileEnabled && !turnstileToken)}
        >
          {mutationIsPending && <Loader2 className="size-4 animate-spin" />}
          Publiser annonse
        </Button>
      </div>
    </>
  );
}
