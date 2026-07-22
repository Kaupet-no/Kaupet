import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPin } from "lucide-react";

import { useIsNative } from "@/hooks/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import { VehicleSpecBar } from "@/components/listing-detail/vehicle/vehicle-spec-bar";
import { VehicleTechTable } from "@/components/listing-detail/vehicle/vehicle-tech-table";
import { CONDITION_LABEL, VEHICLE_CONDITION_LABEL } from "@/lib/constants";
import {
  VEHICLE_LEAF_SLUGS,
  computeOmregistreringsavgift,
  type VehicleLeafSlug,
} from "@/lib/vehicle-classification";
import type { VehicleLookupResult } from "@/lib/vehicle-lookup.server";

const ListingDetailMap = lazy(() =>
  import("@/components/listing-detail-map").then((m) => ({ default: m.ListingDetailMap })),
);
const ImageLightbox = lazy(() =>
  import("@/components/listing-detail/image-lightbox").then((m) => ({ default: m.ImageLightbox })),
);
const MapOverlay = lazy(() =>
  import("@/components/listing-detail/map-overlay").then((m) => ({ default: m.MapOverlay })),
);

function LightboxLoadingFallback() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Laster …</span>
    </div>
  );
}

export type ListingDetailViewCategory = { name_nb: string; slug: string | null } | null;

/**
 * Presentational rendering of the listing detail page — extracted from
 * `$kaupetCode.tsx` so it can be reused unmodified for the pre-publish
 * preview (`ny-annonse.forhandsvisning`). Data-fetching, owner-only actions
 * (stats, contact, edit/delete/report) and back-navigation stay in the
 * callers and are handed in as slots, so this component has no Supabase or
 * routing-history coupling of its own.
 */
export type ListingDetailViewProps = {
  title: string;
  subtitle: string | null;
  description: string;
  priceNok: number | null;
  isFree: boolean;
  condition: string | null;
  city: string | null;
  postalCode: string | null;
  displayLat: number | null;
  displayLng: number | null;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  knownIssues: string | null;
  noKnownIssues: boolean | null;
  maintenanceHistory: string | null;
  category: ListingDetailViewCategory;
  images: { storage_path: string; sort_order: number }[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
  /** Rendered above the gallery on web only (hidden on native, same as today). */
  backSlot?: ReactNode;
  /** Edit/delete/report menu — real, non-owner viewers only. */
  actionsMenuSlot?: ReactNode;
  /** Views/favorites/promote panel — owner only. */
  ownerStatsSlot?: ReactNode;
  /** Contact-seller panel. */
  sellerContactSlot?: ReactNode;
  /** Sticky banner shown instead of the above when this is a pre-publish preview. */
  previewBanner?: ReactNode;
};

export function ListingDetailView({
  title,
  subtitle,
  description,
  priceNok,
  isFree,
  condition,
  city,
  postalCode,
  displayLat,
  displayLng,
  createdAt,
  updatedAt,
  publishedAt,
  knownIssues,
  noKnownIssues,
  maintenanceHistory,
  category,
  images,
  imgUrls,
  attributes,
  backSlot,
  actionsMenuSlot,
  ownerStatsSlot,
  sellerContactSlot,
  previewBanner,
}: ListingDetailViewProps) {
  const isNative = useIsNative();
  const [activeImage, setActiveImage] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const closeMapOverlay = useCallback(() => setMapOverlayOpen(false), []);
  useEffect(() => setMounted(true), []);

  const sortedImages = images.slice().sort((a, b) => a.sort_order - b.sort_order);

  const priceLabel = isFree
    ? "Gis bort"
    : priceNok != null
      ? `${priceNok.toLocaleString("nb-NO")} kr`
      : "Pris ved henvendelse";

  const isVehicleCategory =
    !!category?.slug && VEHICLE_LEAF_SLUGS.includes(category.slug as VehicleLeafSlug);
  const vehicleLookup = isVehicleCategory
    ? ((attributes.vehicle_lookup as VehicleLookupResult | undefined) ?? null)
    : null;
  const mileageKmRaw = attributes.mileage_km;
  const mileageKm =
    isVehicleCategory && typeof mileageKmRaw === "number" && Number.isFinite(mileageKmRaw)
      ? mileageKmRaw
      : null;
  const euControlExemptRaw = attributes.eu_control_exempt;
  const euControlExempt =
    isVehicleCategory && typeof euControlExemptRaw === "boolean" ? euControlExemptRaw : null;
  const avgiftOverrideRaw = attributes.omregistreringsavgift_override_kr;
  const omregistreringsavgiftKr = isVehicleCategory
    ? typeof avgiftOverrideRaw === "number"
      ? avgiftOverrideRaw
      : computeOmregistreringsavgift(
          (category?.slug as VehicleLeafSlug) ?? null,
          vehicleLookup?.weight_kg ?? null,
          vehicleLookup?.first_registration_date
            ? Number(vehicleLookup.first_registration_date.slice(0, 4))
            : null,
        )
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <NativePageHeader title={title} />
      {previewBanner}
      {!isNative && backSlot}

      <div className="mt-4 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative mb-6">
            <ImageGallery
              images={sortedImages}
              imgUrls={imgUrls}
              activeImage={activeImage}
              onSelect={setActiveImage}
              title={title}
              onImageClick={sortedImages.length > 0 ? setLightboxIndex : undefined}
            />
            {sortedImages.length > 0 && (
              <div className="absolute -bottom-4 left-4 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
                <p className="font-display text-xl leading-none text-primary">{priceLabel}</p>
              </div>
            )}
          </div>
          {isVehicleCategory && (
            <VehicleTechTable
              vehicleLookup={vehicleLookup}
              mileageKm={mileageKm}
              euControlExempt={euControlExempt}
            />
          )}
          <section className="mt-8">
            <h2 className="font-display text-xl">Beskrivelse</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {description}
            </p>
          </section>

          {isVehicleCategory && (
            <section className="mt-8">
              <h2 className="font-display text-xl">Kjente feil og mangler</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {noKnownIssues ? "Ingen kjente feil eller mangler oppgitt av selger" : knownIssues}
              </p>
            </section>
          )}

          {isVehicleCategory && maintenanceHistory && (
            <section className="mt-8">
              <h2 className="font-display text-xl">Vedlikeholdshistorikk</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {maintenanceHistory}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {category?.slug && (
                  <Link
                    to="/annonser"
                    search={{ q: "", category: category.slug, sort: "new" }}
                    className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    {category.name_nb}
                  </Link>
                )}
                <h1 className="mt-1 font-display text-3xl leading-tight tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
                {/* Prisen vises flytende over bildekanten når det finnes bilder
                    (se galleriseksjonen) — her kun som fallback uten bilder. */}
                {sortedImages.length === 0 && (
                  <p className="mt-3 font-display text-xl text-primary">{priceLabel}</p>
                )}
                {isVehicleCategory && omregistreringsavgiftKr != null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    + {omregistreringsavgiftKr.toLocaleString("nb-NO")} kr i omregistreringsavgift
                    til staten (betales av kjøper ved eierskifte)
                  </p>
                )}
              </div>
              {actionsMenuSlot && <div className="shrink-0 pt-0.5">{actionsMenuSlot}</div>}
            </div>
          </div>

          {isVehicleCategory && (
            <VehicleSpecBar vehicleLookup={vehicleLookup} mileageKm={mileageKm} />
          )}

          {(() => {
            const fmt = (s: string) =>
              new Date(s).toLocaleDateString("nb-NO", {
                day: "numeric",
                month: "long",
                year: "numeric",
              });
            const publishedDate = publishedAt ? new Date(publishedAt) : new Date(createdAt);
            const updatedDate = updatedAt ? new Date(updatedAt) : null;

            const isEditedLater =
              updatedDate != null &&
              (updatedDate.getFullYear() > publishedDate.getFullYear() ||
                updatedDate.getMonth() > publishedDate.getMonth() ||
                updatedDate.getDate() > publishedDate.getDate());

            const label = isEditedLater ? "Sist redigert" : "Publisert";
            const dateStr =
              isEditedLater && updatedAt ? fmt(updatedAt) : fmt(publishedAt ?? createdAt);

            return (
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
                {condition && (
                  <div>
                    <dt className="text-muted-foreground">Tilstand</dt>
                    <dd className="font-medium">
                      {(isVehicleCategory ? VEHICLE_CONDITION_LABEL : CONDITION_LABEL)[
                        condition as keyof typeof CONDITION_LABEL
                      ] ?? condition}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Lokasjon</dt>
                  <dd className="flex items-center gap-1 font-medium">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {city || postalCode || "Ikke oppgitt"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{dateStr}</dd>
                </div>
              </dl>
            );
          })()}

          {ownerStatsSlot}
          {sellerContactSlot}
        </aside>
      </div>

      {displayLat != null && displayLng != null && (
        <section className="mt-10">
          <button
            type="button"
            onClick={() => setMapOverlayOpen(true)}
            aria-label="Se kart i fullskjerm"
            className="block h-80 w-full cursor-pointer overflow-hidden rounded-2xl border border-border"
          >
            {mounted ? (
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <ListingDetailMap lat={displayLat} lng={displayLng} interactive={false} />
              </Suspense>
            ) : (
              <div className="h-full w-full animate-pulse bg-muted" />
            )}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Lokasjonen er omtrentlig. Gjenstanden befinner seg ikke nødvendigvis innenfor det
            markerte området.
          </p>
        </section>
      )}

      {lightboxIndex !== null && (
        <Suspense fallback={<LightboxLoadingFallback />}>
          <ImageLightbox
            images={sortedImages}
            imgUrls={imgUrls}
            initialIndex={lightboxIndex}
            title={title}
            onClose={closeLightbox}
          />
        </Suspense>
      )}

      {mapOverlayOpen && displayLat != null && displayLng != null && (
        <Suspense fallback={<LightboxLoadingFallback />}>
          <MapOverlay lat={displayLat} lng={displayLng} onClose={closeMapOverlay} />
        </Suspense>
      )}
    </div>
  );
}
