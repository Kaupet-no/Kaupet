import { Loader2, MapPin } from "lucide-react";
import { Turnstile } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  ComposerReview,
  ComposerReviewStatuses,
} from "@/features/listing-creation/composer-review";

import type { WizardSharedProps, ComposerReviewStatus } from "../types";
import { Vehicle360Group } from "../vehicle-360";

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
  const improvementGroups =
    props.improvementGroups ??
    props.improvementGroupKeys.map((key) => ({
      key,
      classification:
        key === "vehicle-360" || key === "vehicle-equipment"
          ? ("optionalEnhancement" as const)
          : ("recommendedForTrust" as const),
    }));
  const improvementClassification = (key: string) =>
    improvementGroups.find((group) => group.key === key)?.classification ?? "recommendedForTrust";
  const editGroup = (key: string) => {
    const section =
      key === "category-select" || key === "category-confirm"
        ? "category"
        : key === "photos" || key === "title"
          ? "content"
          : key === "delivery" || key === "location"
            ? "location"
            : "details";
    props.onEditReviewSection(section, { groupKey: key });
  };
  const improvements = (
    [
      props.improvementGroupKeys.includes("photos") && props.images.length === 0
        ? {
            key: "photos",
            label: "Legg til bilder",
            classification: improvementClassification("photos"),
            onAction: () => editGroup("photos"),
          }
        : null,
      props.improvementGroupKeys.some((key) => key === "price" || key === "vehicle-price") &&
      !props.previewPrice
        ? {
            key: "price",
            label: "Oppgi pris",
            classification: improvementClassification(
              props.improvementGroupKeys.includes("price") ? "price" : "vehicle-price",
            ),
            onAction: () =>
              editGroup(props.improvementGroupKeys.includes("price") ? "price" : "vehicle-price"),
          }
        : null,
      props.improvementGroupKeys.includes("location") && !props.city && !props.postalCode
        ? {
            key: "location",
            label: "Oppgi sted",
            classification: improvementClassification("location"),
            onAction: () => editGroup("location"),
          }
        : null,
      props.isVehicle && props.improvementGroupKeys.includes("vehicle-360")
        ? {
            key: "vehicle-360",
            label: "Ta 360°-opptak",
            classification: improvementClassification("vehicle-360"),
            onAction: () => editGroup("vehicle-360"),
          }
        : null,
    ] as (ComposerReviewStatus | null)[]
  ).filter((item): item is ComposerReviewStatus => item !== null);
  const required = (
    props.publishingRequirements && props.publishingRequirements.length > 0
      ? props.publishingRequirements
      : props.publishingRequirementErrors.map((label, index) => ({
          key: `publishing-requirement-${index}`,
          label,
          classification: "requiredToPublish" as const,
        }))
  ) as ComposerReviewStatus[];

  return (
    <>
      <section aria-labelledby="publishing-readiness-title" className="space-y-2">
        <h3 id="publishing-readiness-title" className="text-lg font-semibold">
          Publiseringsklar
        </h3>
        {required.length > 0 ? (
          <ComposerReviewStatuses items={required} />
        ) : (
          <p className="text-sm text-muted-foreground">Alle publiseringskrav er oppfylt.</p>
        )}
      </section>
      {improvements.length > 0 && (
        <section aria-labelledby="listing-improvements-title" className="space-y-3">
          <div>
            <h3 id="listing-improvements-title" className="text-lg font-semibold">
              Dette vil gi en bedre annonse
            </h3>
            <p className="text-sm text-muted-foreground">
              Valgfritt – du kan fortsatt publisere annonsen.
            </p>
          </div>
          <ComposerReviewStatuses items={improvements} />
          {props.isVehicle && props.improvementGroupKeys.includes("vehicle-360") && (
            <Vehicle360Group {...props} />
          )}
        </section>
      )}
      <ComposerReview
        items={[
          {
            key: "category",
            label: "Kategori",
            value: props.categoryLabel || "Ikke valgt",
            onEdit: () => props.onEditReviewSection("category"),
          },
          {
            key: "content",
            label: "Tittel og bilder",
            value: `${props.title || "Ingen tittel"} · ${props.images.length} ${props.images.length === 1 ? "bilde" : "bilder"}`,
            onEdit: () => props.onEditReviewSection("content"),
          },
          {
            key: "details",
            label: "Pris og detaljer",
            value:
              [props.previewPrice, props.subtitle].filter(Boolean).join(" · ") || "Ikke oppgitt",
            onEdit: () => props.onEditReviewSection("details"),
          },
          {
            key: "location",
            label: "Sted",
            value: [props.postalCode, props.city].filter(Boolean).join(" ") || "Ikke oppgitt",
            onEdit: () => props.onEditReviewSection("location"),
          },
        ]}
      />
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
      <>
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
          className="min-h-12 min-w-24 rounded-xl px-3 text-base"
        >
          {mutationIsPending && <Loader2 className="size-4 animate-spin" />}
          Publiser
        </Button>
      </>
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
