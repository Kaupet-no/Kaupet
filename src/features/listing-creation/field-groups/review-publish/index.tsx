import { type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ComposerReviewStatuses } from "@/features/listing-creation/composer-review";

import type { WizardSharedProps, ComposerReviewStatus } from "../types";
import { Vehicle360Group } from "../vehicle-360";

type ReviewPreviewProps = Pick<
  WizardSharedProps,
  | "images"
  | "title"
  | "subtitle"
  | "priceNok"
  | "isFree"
  | "city"
  | "postalCode"
  | "categorySlug"
  | "attributes"
> & {
  headingId?: string;
  onPreview?: () => void;
};

/** Preview card using the same presentation as the public listing grid. */
export function ReviewPreview({
  images,
  title,
  subtitle,
  priceNok,
  isFree,
  city,
  categorySlug,
  attributes,
  headingId = "listing-preview-title",
  onPreview,
}: ReviewPreviewProps) {
  const listing: ListingCardData = {
    id: "preview",
    kaupet_code: "",
    title: title || "—",
    subtitle: subtitle || null,
    price_nok: typeof priceNok === "number" ? priceNok : null,
    is_free: isFree ?? false,
    city: city || null,
    created_at: "",
    cover_path: null,
    mileage_km: typeof attributes?.mileage_km === "number" ? attributes.mileage_km : null,
    engine_hours: typeof attributes?.engine_hours === "number" ? attributes.engine_hours : null,
    category_slug: categorySlug,
    attributes,
  };
  const card = (
    <ListingCard
      listing={listing}
      preview
      signedImageUrl={images[0]?.previewUrl ?? null}
      missingPriceLabel="Pris ikke satt"
    />
  );

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-semibold">
        Forhåndsvisning
      </h3>
      <p className="text-xs text-muted-foreground">
        Dette er slik annonsen din vil se ut i søkelisten
      </p>
      {onPreview ? (
        <button
          type="button"
          onClick={onPreview}
          /* Navnet hentes fra den synlige teksten under kortet i stedet for en
             egen aria-label — ellers leses den samme setningen to ganger. */
          aria-labelledby={`${headingId}-action`}
          className="block w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:max-w-[220px]"
        >
          {card}
        </button>
      ) : (
        <div className="sm:max-w-[220px]">{card}</div>
      )}
      {onPreview && (
        <p id={`${headingId}-action`} className="text-xs text-muted-foreground">
          Trykk for å forhåndsvise annonsen
        </p>
      )}
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
  turnstileRef: RefObject<TurnstileInstance | null>;
  mutationIsPending: boolean;
  onCancel: () => void;
  isGuest?: boolean;
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
              Gjør annonsen bedre
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
      {/* Asiden viser den samme forhåndsvisningen fra lg og opp, men finnes
          verken i native eller under lg — der er denne den eneste. */}
      <div className={props.native ? undefined : "lg:hidden"}>
        <ReviewPreview
          images={props.images}
          title={props.title}
          subtitle={props.subtitle}
          priceNok={props.priceNok}
          isFree={props.isFree}
          city={props.city}
          postalCode={props.postalCode}
          categorySlug={props.categorySlug}
          attributes={props.attributes}
          onPreview={props.onPreview}
        />
      </div>
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
export function PublishActions({
  native,
  turnstileEnabled,
  turnstileRef,
  mutationIsPending,
  onCancel,
  isGuest = false,
}: PublishActionsProps) {
  if (native) {
    return (
      <>
        {turnstileEnabled && (
          <Turnstile
            ref={turnstileRef}
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            options={{ appearance: "interaction-only", action: "kaupet" }}
          />
        )}
        <Button
          type="submit"
          data-testid="publish-listing-button"
          disabled={mutationIsPending}
          className="min-h-12 min-w-24 rounded-xl px-3 text-base"
        >
          {mutationIsPending && <Loader2 className="size-4 animate-spin" />}
          {isGuest ? "Logg inn og publiser" : "Publiser"}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={mutationIsPending}
        className="hidden lg:inline-flex"
      >
        Avbryt
      </Button>
      <div className="flex w-full items-center gap-3 lg:w-auto">
        {turnstileEnabled && (
          <Turnstile
            ref={turnstileRef}
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            options={{ appearance: "interaction-only", action: "kaupet" }}
          />
        )}
        <Button
          type="submit"
          data-testid="publish-listing-button"
          disabled={mutationIsPending}
          className="h-14 w-full text-base lg:h-11 lg:w-auto lg:text-sm"
        >
          {mutationIsPending && <Loader2 className="size-4 animate-spin" />}
          {isGuest ? "Logg inn og publiser" : "Publiser annonse"}
        </Button>
      </div>
    </>
  );
}
