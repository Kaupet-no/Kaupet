import { Fragment, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPin, Maximize2 } from "lucide-react";

import { useIsNative } from "@/hooks/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import {
  Vehicle360Viewer,
  type Vehicle360Frame,
} from "@/components/listing-detail/vehicle/vehicle-360-viewer";
import { VehicleEquipmentList } from "@/components/listing-detail/vehicle/vehicle-equipment-list";
import { VehicleInfoGrid } from "@/components/listing-detail/vehicle/vehicle-info-grid";
import { VehicleTechTable } from "@/components/listing-detail/vehicle/vehicle-tech-table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { CONDITION_LABEL, VEHICLE_CONDITION_LABEL } from "@/lib/constants";
import {
  VEHICLE_LEAF_SLUGS,
  computeOmregistreringsavgift,
  type AvgiftskodeGruppe,
  type VehicleLeafSlug,
} from "@/lib/vehicle/vehicle-classification";
import { parseVehicleLookup } from "@/lib/vehicle/parse-vehicle-lookup";

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

/** A single crumb in the ancestor chain from a root category down to the
 * listing's own leaf category, e.g. [Bil og MC, Personbil, Stasjonsvogn]. */
export type ListingDetailBreadcrumbItem = { name_nb: string; slug: string };

/**
 * Presentational rendering of the listing detail page — extracted from
 * `$kaupetCode.tsx` so it can be reused unmodified for the pre-publish
 * preview (see `PreviewDraftView`, rendered as an in-place overlay by the
 * wizard). Data-fetching, owner-only actions
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
  /** Full ancestor chain for the category breadcrumb, root first. Falls back
   * to a single plain category link (using `category` above) when omitted —
   * the pre-publish preview doesn't have the category tree on hand. */
  breadcrumb?: ListingDetailBreadcrumbItem[];
  images: { storage_path: string; sort_order: number; caption?: string | null }[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
  /** 360°-bildesekvens tatt via mobilappen (Bil/MC-kategorier). Tom/utelatt
   * for annonser uten 360-opptak. */
  vehicle360Frames?: Vehicle360Frame[];
  vehicle360ImgUrls?: Record<string, string>;
  /** Rendered above the gallery on web only (hidden on native, same as today). */
  backSlot?: ReactNode;
  /** Edit/delete/report menu — real, non-owner viewers only. */
  actionsMenuSlot?: ReactNode;
  /** Views/favorites/promote panel — owner only. */
  ownerStatsSlot?: ReactNode;
  /** Contact-seller panel. */
  sellerContactSlot?: ReactNode;
  /** Compact "Send melding"-button shown in the fixed mobile contact bar.
   * Omitted (e.g. for the owner's own listing, or the pre-publish preview)
   * hides the bar entirely. Web only — native has its own bottom nav. */
  stickyContactSlot?: ReactNode;
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
  breadcrumb,
  images,
  imgUrls,
  attributes,
  vehicle360Frames,
  vehicle360ImgUrls,
  backSlot,
  actionsMenuSlot,
  ownerStatsSlot,
  sellerContactSlot,
  stickyContactSlot,
  previewBanner,
}: ListingDetailViewProps) {
  const isNative = useIsNative();
  const [activeImage, setActiveImage] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const [galleryTab, setGalleryTab] = useState<"images" | "360">("images");
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const closeMapOverlay = useCallback(() => setMapOverlayOpen(false), []);
  useEffect(() => setMounted(true), []);

  const sortedImages = images.slice().sort((a, b) => a.sort_order - b.sort_order);
  const has360 = !!vehicle360Frames && vehicle360Frames.length > 0;
  const showStickyContact = !isNative && !!stickyContactSlot;

  const priceLabel = isFree
    ? "Gis bort"
    : priceNok != null
      ? `${priceNok.toLocaleString("nb-NO")} kr`
      : "Pris ved henvendelse";

  // Slug-based, not the canonical filter-based `isVehicleCategory`
  // (category-filters.ts) — this view only receives `category.slug`, not the
  // category_filters rows needed to walk the ancestor chain for a
  // brand_select filter. Named distinctly from that function to avoid
  // implying they're the same check.
  const isVehicleListing =
    !!category?.slug && VEHICLE_LEAF_SLUGS.includes(category.slug as VehicleLeafSlug);
  const vehicleLookupRaw = attributes.vehicle_lookup;
  const vehicleLookup = isVehicleListing ? (parseVehicleLookup(vehicleLookupRaw) ?? null) : null;
  const mileageKmRaw = attributes.mileage_km;
  const mileageKm =
    isVehicleListing && typeof mileageKmRaw === "number" && Number.isFinite(mileageKmRaw)
      ? mileageKmRaw
      : null;
  const euControlExemptRaw = attributes.eu_control_exempt;
  const euControlExempt =
    isVehicleListing && typeof euControlExemptRaw === "boolean" ? euControlExemptRaw : null;
  // Seller-confirmed override (see `vehicle-confirm/index.tsx`), stored
  // top-level like `mileage_km` — takes precedence over the SVV snapshot's
  // `vehicle_lookup.drive_type`, which is often `null` when SVV doesn't
  // expose axle data for the vehicle.
  const driveTypeRaw = attributes.drive_type;
  const driveType =
    isVehicleListing && typeof driveTypeRaw === "string"
      ? driveTypeRaw
      : (vehicleLookup?.drive_type ?? null);
  const avgiftOverrideRaw = attributes.omregistreringsavgift_override_kr;
  const avgiftFritatt = isVehicleListing && attributes.omregistreringsavgift_fritatt === true;
  const avgiftInkludert = isVehicleListing && attributes.omregistreringsavgift_inkludert === true;
  const omregistreringsavgiftKr = isVehicleListing
    ? typeof avgiftOverrideRaw === "number"
      ? avgiftOverrideRaw
      : computeOmregistreringsavgift(
          (category?.slug as VehicleLeafSlug) ?? null,
          vehicleLookup?.weight_kg ?? null,
          vehicleLookup?.first_registration_date
            ? Number(vehicleLookup.first_registration_date.slice(0, 4))
            : null,
          (attributes.avgiftskode_gruppe as AvgiftskodeGruppe | undefined) ?? null,
        )
    : null;

  const avgiftNote = avgiftFritatt
    ? "Fritatt for omregistreringsavgift"
    : avgiftInkludert
      ? "omregistreringsavgift inkludert i kjøpesummen (dekkes av selger)"
      : omregistreringsavgiftKr != null
        ? `+ ${omregistreringsavgiftKr.toLocaleString("nb-NO")} kr i omregistreringsavgift ved eierskifte (betales av kjøper)`
        : null;

  return (
    <div className={`mx-auto max-w-6xl px-4 py-8 ${showStickyContact ? "pb-28 md:pb-8" : ""}`}>
      <NativePageHeader title={title} />
      {previewBanner}
      {!isNative && backSlot}

      <header className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {breadcrumb && breadcrumb.length > 0 ? (
              <Breadcrumb>
                <BreadcrumbList className="gap-1 text-xs uppercase tracking-wide sm:gap-1">
                  {breadcrumb.map((c, i) => (
                    <Fragment key={c.slug}>
                      {i > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem>
                        {i === breadcrumb.length - 1 ? (
                          <BreadcrumbPage className="uppercase tracking-wide">
                            {c.name_nb}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link
                              to="/annonser"
                              search={{ q: "", category: c.slug, sort: "new" }}
                              className="hover:text-foreground"
                            >
                              {c.name_nb}
                            </Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              category?.slug && (
                <Link
                  to="/annonser"
                  search={{ q: "", category: category.slug, sort: "new" }}
                  className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  {category.name_nb}
                </Link>
              )
            )}
            <h1 className="mt-1 font-display text-3xl leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actionsMenuSlot && <div className="shrink-0 pt-0.5">{actionsMenuSlot}</div>}
        </div>
      </header>

      <div className="mt-6 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-8">
            {has360 && (
              <div className="mb-3 inline-flex rounded-full border border-border bg-muted/40 p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => setGalleryTab("images")}
                  className={`rounded-full px-3 py-1 transition ${galleryTab === "images" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
                >
                  Bilder
                </button>
                <button
                  type="button"
                  onClick={() => setGalleryTab("360")}
                  className={`rounded-full px-3 py-1 transition ${galleryTab === "360" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
                >
                  360°
                </button>
              </div>
            )}
            {galleryTab === "360" && has360 ? (
              <Vehicle360Viewer
                frames={vehicle360Frames!}
                imgUrls={vehicle360ImgUrls ?? {}}
                title={title}
              />
            ) : (
              <ImageGallery
                images={sortedImages}
                imgUrls={imgUrls}
                activeImage={activeImage}
                onSelect={setActiveImage}
                title={title}
                onImageClick={sortedImages.length > 0 ? setLightboxIndex : undefined}
                overlaySlot={
                  sortedImages.length > 0 && (
                    <div className="absolute -bottom-8 left-4 max-w-[calc(100%-2rem)] rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
                      <p className="font-display text-xl leading-none text-primary">{priceLabel}</p>
                      {avgiftNote && (
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">
                          {avgiftNote}
                        </p>
                      )}
                    </div>
                  )
                }
              />
            )}
          </div>

          {sortedImages.length === 0 && (
            <div>
              <p className="font-display text-xl text-primary">{priceLabel}</p>
              {avgiftNote && <p className="mt-1 text-xs text-muted-foreground">{avgiftNote}</p>}
            </div>
          )}

          {isVehicleListing && (
            <VehicleInfoGrid
              vehicleLookup={vehicleLookup}
              mileageKm={mileageKm}
              euControlExempt={euControlExempt}
              driveType={driveType}
            />
          )}

          <section className="mt-8">
            <h2 className="font-display text-xl">Beskrivelse</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {description}
            </p>
          </section>

          {isVehicleListing && (
            <section className="mt-8">
              <h2 className="font-display text-xl">Kjente feil og mangler</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {noKnownIssues ? "Ingen kjente feil eller mangler oppgitt av selger" : knownIssues}
              </p>
            </section>
          )}

          {isVehicleListing && maintenanceHistory && (
            <section className="mt-8">
              <h2 className="font-display text-xl">Vedlikeholdshistorikk</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {maintenanceHistory}
              </p>
            </section>
          )}

          {isVehicleListing && (
            <section className="mt-8">
              <h2 className="font-display text-xl">Utstyr</h2>
              <VehicleEquipmentList attributes={attributes} />
              <VehicleTechTable
                vehicleLookup={vehicleLookup}
                mileageKm={mileageKm}
                euControlExempt={euControlExempt}
                driveType={driveType}
              />
            </section>
          )}
        </div>

        <aside className="@container space-y-5">
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
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm @sm:grid-cols-3">
                {condition && (
                  <div>
                    <dt className="text-muted-foreground">Tilstand</dt>
                    <dd className="font-medium">
                      {(isVehicleListing ? VEHICLE_CONDITION_LABEL : CONDITION_LABEL)[
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
            className="relative block h-80 w-full cursor-pointer overflow-hidden rounded-2xl border border-border"
          >
            {mounted ? (
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <ListingDetailMap lat={displayLat} lng={displayLng} interactive={false} />
              </Suspense>
            ) : (
              <div className="h-full w-full animate-pulse bg-muted" />
            )}
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg">
              <Maximize2 className="size-3.5" />
              Se i fullskjerm
            </span>
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

      {showStickyContact && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="font-display text-lg leading-none text-primary">{priceLabel}</p>
            {stickyContactSlot}
          </div>
        </div>
      )}
    </div>
  );
}
