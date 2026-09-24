import { type ReactNode, type RefObject } from "react";
import { ImageIcon, Loader2, MapPin, Pencil } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CONDITION_LABEL, VEHICLE_CONDITION_LABEL_BY_SLUG } from "@/lib/constants";
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

/** En seksjon i den lokale annonsevisningen, med en diskret Endre-knapp og et
 * fokuserbart anker (`review-section-<anchor>`) — ny-annonse.tsx scroller/
 * fokuserer dit når brukeren kommer tilbake fra en redigering herfra (se
 * `returnFocusGroupKeyRef`). `active` markerer delen som hører til steget
 * brukeren står på nå — kun brukt av det levende lerretet i sidekolonnen
 * (ny-annonse.tsx), aldri av Se over selv. */
function ListingReviewSection({
  anchor,
  editLabel,
  onEdit,
  active,
  children,
}: {
  anchor: string;
  editLabel: string;
  onEdit: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={`review-section-${anchor}`}
      tabIndex={-1}
      className={cn(
        "scroll-mt-24 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active && "border-2 border-dashed border-brand p-3",
      )}
    >
      {active && <p className="mb-1.5 text-xs font-medium text-brand-text">Du redigerer</p>}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={editLabel}
          className="native-touch-target shrink-0 gap-1.5 text-muted-foreground"
        >
          <Pencil className="size-3.5" aria-hidden />
          Endre
        </Button>
      </div>
    </div>
  );
}

type ListingPreviewCanvasProps = WizardSharedProps & {
  /** Ankrene til delen som hører til steget brukeren står på nå (f.eks.
   * ["price"]) — markeres med stiplet ramme + "Du redigerer". Kun satt av
   * det levende lerretet i sidekolonnen (ny-annonse.tsx); Se over selv
   * bruker aldri denne. */
  activeAnchors?: string[];
};

/**
 * De seks delene av annonsen slik kjøperen ser den — bilder, tittel, pris,
 * viktige egenskaper, beskrivelse, sted — hver med et fokuserbart anker og
 * en diskret Endre-knapp som hopper til steget som eier delen. Delt mellom
 * Se over-steget (`ReviewPublishGroup`, N1) og det levende lerretet i
 * sidekolonnen på desktop (ny-annonse.tsx sin aside), slik at kjøpervisningen
 * kun vedlikeholdes ett sted.
 */
export function ListingPreviewCanvas(props: ListingPreviewCanvasProps) {
  const isActive = (anchor: string) => !!props.activeAnchors?.includes(anchor);

  const priceGroupKey = props.improvementGroupKeys.includes("vehicle-price")
    ? "vehicle-price"
    : "price";
  const factsGroupKey = props.isVehicle
    ? "vehicle-facts"
    : props.boatFactsActive
      ? "boat-facts"
      : "category-attributes";
  const editSection = (
    groupKey: string,
    section: "category" | "content" | "details" | "location",
    anchor: string,
    field?: string,
  ) => props.onEditReviewSection(section, { groupKey, field, reviewAnchor: anchor });

  const priceLabel = props.isFree
    ? "Gis bort"
    : typeof props.priceNok === "number"
      ? `${props.priceNok.toLocaleString("nb-NO")} kr`
      : "Pris ikke satt";

  // ponytail: tilstand/kilometerstand/henting dekker "viktige egenskaper" for
  // de vanligste kategoriene uten en generisk attributt→etikett-oppslag —
  // utvid med flere category_filters-nøkler her om reviewet trenger mer.
  const conditionLabels =
    (props.isVehicle && props.categorySlug
      ? (VEHICLE_CONDITION_LABEL_BY_SLUG as Record<string, Record<string, string>>)[
          props.categorySlug
        ]
      : undefined) ?? (CONDITION_LABEL as Record<string, string>);
  const conditionLabel = props.condition
    ? (conditionLabels[props.condition] ?? props.condition)
    : null;
  const deliveryLabel = props.behavior.requiresDeliveryMethod
    ? props.canShip === "ship"
      ? "Kan sendes"
      : props.canShip === "pickup"
        ? "Kun henting"
        : null
    : null;
  const mileageKm = props.attributes.mileage_km;
  const mileageLabel =
    props.isVehicle && props.showMileage && typeof mileageKm === "number"
      ? `${mileageKm.toLocaleString("nb-NO")} km`
      : null;
  const factChips = [conditionLabel, mileageLabel, deliveryLabel].filter((v): v is string => !!v);

  return (
    <div className="space-y-6">
      <ListingReviewSection
        anchor="photos"
        editLabel="Endre bilder"
        active={isActive("photos")}
        onEdit={() => editSection("photos", "content", "photos")}
      >
        {props.images.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {props.images.slice(0, 6).map((img, index) => (
              <img
                key={img.id}
                src={img.previewUrl}
                alt=""
                className={cn(
                  "shrink-0 rounded-lg object-cover",
                  index === 0 ? "h-40 w-40 sm:h-48 sm:w-48" : "h-24 w-24",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">Ingen bilder ennå</p>
          </div>
        )}
      </ListingReviewSection>

      <ListingReviewSection
        anchor="title"
        editLabel="Endre tittel"
        active={isActive("title")}
        onEdit={() => editSection("title", "content", "title", "title")}
      >
        <h2 className="font-display text-2xl leading-tight tracking-tight">
          {props.title || "Uten tittel ennå"}
        </h2>
      </ListingReviewSection>

      <ListingReviewSection
        anchor="price"
        editLabel="Endre pris"
        active={isActive("price")}
        onEdit={() => editSection(priceGroupKey, "details", "price", "price_nok")}
      >
        <p className="font-display text-2xl font-semibold text-primary">{priceLabel}</p>
      </ListingReviewSection>

      {factChips.length > 0 && (
        <ListingReviewSection
          anchor="facts"
          editLabel="Endre detaljer"
          active={isActive("facts")}
          onEdit={() => editSection(factsGroupKey, "details", "facts")}
        >
          <ul className="flex flex-wrap gap-2">
            {factChips.map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-foreground"
              >
                {chip}
              </li>
            ))}
          </ul>
        </ListingReviewSection>
      )}

      <ListingReviewSection
        anchor="description"
        editLabel="Endre beskrivelse"
        active={isActive("description")}
        onEdit={() => editSection("description-keywords", "details", "description", "description")}
      >
        <h3 className="text-sm font-semibold text-muted-foreground">Beskrivelse</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {props.description || "Ingen beskrivelse ennå"}
        </p>
      </ListingReviewSection>

      <ListingReviewSection
        anchor="location"
        editLabel="Endre sted"
        active={isActive("location")}
        onEdit={() => editSection("location", "location", "location", "postal_code")}
      >
        <p className="flex items-center gap-1.5 text-sm text-foreground">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {props.city || props.postalCode || "Ikke oppgitt"}
        </p>
      </ListingReviewSection>
    </div>
  );
}

/**
 * Registry-facing wrapper: den lokale annonsevisningen (N1, via
 * `ListingPreviewCanvas`) + annonsestyrke-indikatoren (V3) + UploadProgress.
 * `PublishActions` er deliberately excluded — it renders inline in the
 * wizard's footer bar next to "Tilbake" (not stacked above it), same as
 * today, so ny-annonse.tsx renders it explicitly on the last page instead of
 * via this wrapper.
 *
 * Gjenbruker ikke ListingDetailView/PreviewDraftView direkte: den komponenten
 * er bygget for publiserte bilder (storage_path + imgUrls) og drar med seg
 * router/kart/redigeringskontekst den ikke trenger her, mens utkastets bilder
 * fortsatt er lokale blob-er (PendingImage). "Se full forhåndsvisning"-lenken
 * under åpner den ekte visningen (samme overlay som før) for den som vil se
 * akkurat det kjøper ser.
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
      {/* På desktop er Se over allerede full bredde (lerretet i sidekolonnen
          skjules på dette steget, se ny-annonse.tsx), så indikatoren vises
          her uansett plattform — ikke bare på native/mobilnett som før. */}
      <ListingStrengthIndicator required={required} improvements={improvements} />

      <ListingPreviewCanvas {...props} />

      {props.onPreview && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-sm"
          onClick={props.onPreview}
        >
          Se full forhåndsvisning
        </Button>
      )}

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
