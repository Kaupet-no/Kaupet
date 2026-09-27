import { type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ListingStrengthIndicator } from "@/features/listing-creation/composer-review";

import type { WizardSharedProps, ComposerReviewStatus } from "../types";
import { Vehicle360Group } from "../vehicle-360";
import { deriveComposerImprovements } from "./derive-improvements";

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
 * Registry-facing wrapper: annonsestyrken (V3) + annonsesiden i
 * redigeringsmodus (`reviewListing`, bygget i ny-annonse.tsx) + UploadProgress.
 * `PublishActions` er deliberately excluded — it renders inline in the
 * wizard's footer bar next to "Tilbake" (not stacked above it), same as
 * today, so ny-annonse.tsx renders it explicitly on the last page instead of
 * via this wrapper.
 */
export function ReviewPublishGroup(props: WizardSharedProps) {
  const improvements = deriveComposerImprovements(props);
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
      {/* Se over har ingen telefonramme eller annonsestyrke i stegraden (se
          ny-annonse.tsx), så indikatoren vises her uansett plattform. */}
      <ListingStrengthIndicator required={required} improvements={improvements} />

      {props.reviewListing}

      {props.isVehicle && props.improvementGroupKeys.includes("vehicle-360") && (
        <Vehicle360Group {...props} />
      )}

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
