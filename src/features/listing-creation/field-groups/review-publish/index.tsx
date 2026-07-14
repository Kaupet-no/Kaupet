import { Loader2, MapPin } from "lucide-react";
import { Turnstile } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

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
  turnstileEnabled: boolean;
  turnstileToken: string | null;
  setTurnstileToken: (token: string | null) => void;
  mutationIsPending: boolean;
  onCancel: () => void;
};

/**
 * Registry-facing wrapper: ReviewPreview + UploadProgress. `PublishActions`
 * is deliberately excluded — it renders inline in the wizard's footer bar
 * next to "Tilbake" (not stacked above it), same as today, so ny-annonse.tsx
 * renders it explicitly on the last page instead of via this wrapper.
 */
export function ReviewPublishGroup(props: WizardSharedProps) {
  return (
    <>
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
          Kjøretøyopplysningene i denne annonsen er hentet fra Statens vegvesen. Du er ansvarlig for
          at de stemmer — gå tilbake for å rette dersom noe er feil.
        </p>
      )}
      <UploadProgress
        mutationIsPending={props.mutationIsPending}
        uploadProgress={props.uploadProgress}
      />
    </>
  );
}

/** Turnstile + "Avbryt" + "Publiser annonse" submit button — shared verbatim. */
export function PublishActions({
  turnstileEnabled,
  turnstileToken,
  setTurnstileToken,
  mutationIsPending,
  onCancel,
}: PublishActionsProps) {
  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={mutationIsPending}>
        Avbryt
      </Button>
      {turnstileEnabled && (
        <Turnstile
          siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
          onSuccess={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken(null)}
          options={{ size: "invisible" }}
        />
      )}
      <Button type="submit" disabled={mutationIsPending || (turnstileEnabled && !turnstileToken)}>
        {mutationIsPending && <Loader2 className="size-4 animate-spin" />}
        Publiser annonse
      </Button>
    </div>
  );
}
