import { type ReactNode, type RefObject } from "react";
import { ImageIcon, Loader2, MapPin, Pencil } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CONDITION_LABEL, VEHICLE_CONDITION_LABEL_BY_SLUG } from "@/lib/constants";
import { ListingStrengthIndicator } from "@/features/listing-creation/composer-review";

import type { WizardSharedProps, ComposerReviewStatus } from "../types";
import { Vehicle360Group } from "../vehicle-360";
import { deriveComposerImprovements } from "./derive-improvements";

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

/** En seksjon i den lokale annonsevisningen på Se over-steget, med en
 * diskret Endre-knapp og et fokuserbart anker (`review-section-<anchor>`) —
 * ny-annonse.tsx scroller/fokuserer dit når brukeren kommer tilbake fra en
 * redigering herfra (se `returnFocusGroupKeyRef`). */
function ListingReviewSection({
  anchor,
  editLabel,
  onEdit,
  children,
}: {
  anchor: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div
      id={`review-section-${anchor}`}
      tabIndex={-1}
      className="scroll-mt-24 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
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

/**
 * Registry-facing wrapper: den lokale annonsevisningen (N1) + annonsestyrke-
 * indikatoren (V3, kun mobil — desktop har den i sidekolonnen gjennom hele
 * flyten, se ny-annonse.tsx) + UploadProgress. `PublishActions` er
 * deliberately excluded — it renders inline in the wizard's footer bar next
 * to "Tilbake" (not stacked above it), same as today, so ny-annonse.tsx
 * renders it explicitly on the last page instead of via this wrapper.
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
    <>
      {/* Desktop har indikatoren i sidekolonnen gjennom hele flyten (se
          ny-annonse.tsx sin aside) — her repeteres den bare der det ikke
          finnes noen sidekolonne: native og mobilnett. */}
      <div className={props.native ? undefined : "lg:hidden"}>
        <ListingStrengthIndicator required={required} improvements={improvements} />
      </div>

      <div className="space-y-6">
        <ListingReviewSection
          anchor="photos"
          editLabel="Endre bilder"
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
          onEdit={() => editSection("title", "content", "title", "title")}
        >
          <h2 className="font-display text-2xl leading-tight tracking-tight">
            {props.title || "Uten tittel ennå"}
          </h2>
        </ListingReviewSection>

        <ListingReviewSection
          anchor="price"
          editLabel="Endre pris"
          onEdit={() => editSection(priceGroupKey, "details", "price", "price_nok")}
        >
          <p className="font-display text-2xl font-semibold text-primary">{priceLabel}</p>
        </ListingReviewSection>

        {factChips.length > 0 && (
          <ListingReviewSection
            anchor="facts"
            editLabel="Endre detaljer"
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
          onEdit={() =>
            editSection("description-keywords", "details", "description", "description")
          }
        >
          <h3 className="text-sm font-semibold text-muted-foreground">Beskrivelse</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {props.description || "Ingen beskrivelse ennå"}
          </p>
        </ListingReviewSection>

        <ListingReviewSection
          anchor="location"
          editLabel="Endre sted"
          onEdit={() => editSection("location", "location", "location", "postal_code")}
        >
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {props.city || props.postalCode || "Ikke oppgitt"}
          </p>
        </ListingReviewSection>
      </div>

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
