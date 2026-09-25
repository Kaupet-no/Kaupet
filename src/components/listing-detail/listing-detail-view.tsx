import { Fragment, lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { ClientOnly, Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft, Expand, Loader2, MapPin, Maximize2, Shrink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsNative } from "@/hooks/use-is-native";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useWideGallery } from "@/hooks/use-gallery-width";
import { NativePageHeader } from "@/components/native-page-header";
import { readLastSearchContext } from "@/lib/last-search-context";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import { type Vehicle360Frame } from "@/components/listing-detail/vehicle/vehicle-360-viewer";
import { VehicleEquipmentList } from "@/components/listing-detail/vehicle/vehicle-equipment-list";
import { VehicleInfoGrid } from "@/components/listing-detail/vehicle/vehicle-info-grid";
import {
  BoatExtraInfo,
  BoatInfoGrid,
  isBoatAttributes,
} from "@/components/listing-detail/boat/boat-info-grid";
import { RegistrationPlate } from "@/components/listing-detail/vehicle/registration-plate";
import { VehicleTechTable } from "@/components/listing-detail/vehicle/vehicle-tech-table";
import { LoanCalculator } from "@/components/listing-detail/vehicle/loan-calculator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CONDITION_LABEL,
  VEHICLE_CONDITION_LABEL_BY_SLUG,
  CONDITIONS,
  VEHICLE_CONDITIONS_BY_SLUG,
} from "@/lib/constants";
import type { ProffOrganizationPresentation } from "@/components/listing-detail/proff-listing-types";
import { ProffListingHeader } from "@/components/listing-detail/proff-listing-presentation";
import {
  VEHICLE_LEAF_SLUGS,
  computeOmregistreringsavgift,
  type AvgiftskodeGruppe,
  type VehicleLeafSlug,
} from "@/lib/vehicle/vehicle-classification";
import { PART_FITMENT_SCOPE_KEY } from "@/lib/category-filters";
import { firstRegistrationYear } from "@/lib/vehicle/first-registration";
import { parseVehicleLookup } from "@/lib/vehicle/parse-vehicle-lookup";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ListingEditContext,
  useListingEdit,
  type ListingEditContextValue,
} from "@/features/listing-edit/edit-mode-context";
import { EditableField } from "@/features/listing-edit/editable-field";
import { EditableRegion } from "@/features/listing-edit/editable-region";
import { VehicleFactsPanel } from "@/components/listing-detail/edit-panels/vehicle-facts-panel";
import { VehicleConditionPanel } from "@/components/listing-detail/edit-panels/vehicle-condition-panel";
import { SellerNoKnownIssues } from "@/components/listing-detail/listing-evidence";
import { VehicleEquipmentPanel } from "@/components/listing-detail/edit-panels/vehicle-equipment-panel";
import { GenericAttributesPanel } from "@/components/listing-detail/edit-panels/generic-attributes-panel";
import { GenericAttributesGrid } from "@/components/listing-detail/generic-attributes-grid";
import { PartFitmentSummary } from "@/components/listing-detail/part-fitment-summary";
import { getListingDateMeta } from "@/components/listing-detail/listing-date-meta";

const ListingDetailMap = lazy(() =>
  import("@/components/listing-detail-map").then((m) => ({ default: m.ListingDetailMap })),
);
const FullscreenLocationPicker = lazy(() =>
  import("@/components/fullscreen-location-picker").then((m) => ({
    default: m.FullscreenLocationPicker,
  })),
);
const ImageLightbox = lazy(() =>
  import("@/components/listing-detail/image-lightbox").then((m) => ({ default: m.ImageLightbox })),
);
const MapOverlay = lazy(() =>
  import("@/components/listing-detail/map-overlay").then((m) => ({ default: m.MapOverlay })),
);

/** Grå strek i stedet for et felt selgeren ikke har fylt ut ennå — kun i
 * telefonrammen i annonseflyten (`phonePreview`). */
function PlaceholderLine({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`block h-2.5 rounded-full bg-foreground/10 ${className ?? ""}`} />
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className="mb-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}

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

/** Link back to the last /annonser search this session, read from
 * sessionStorage (see last-search-context.ts) — rendered inside
 * `ClientOnly` since sessionStorage isn't available during SSR. Renders
 * nothing unless the current navigation actually came from a search result
 * (the `fromSearch` router state set by result-list.tsx/listings-map.tsx on
 * the listing link) — otherwise a stale search from earlier in the session
 * would show up on an unrelated listing (see F12). */
function BackToSearchLink() {
  const fromSearch = useLocation({
    select: (l) => Boolean((l.state as unknown as Record<string, unknown>).fromSearch),
  });
  const ctx = readLastSearchContext();
  if (!fromSearch || !ctx) return null;
  return (
    <Link
      to="/annonser"
      search={ctx.search}
      className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Tilbake til {ctx.label}
    </Link>
  );
}

export type ListingOrganizationBrand = ProffOrganizationPresentation;

export type ListingDetailViewCategory = { name_nb: string; slug: string | null } | null;

/** A single crumb in the ancestor chain from a root category down to the
 * listing's own leaf category, e.g. [Bil og MC, Personbil, Stasjonsvogn]. */
export type ListingDetailBreadcrumbItem = {
  name_nb: string;
  slug: string | null;
  /** Compact-encoded attribute filters (see `encodeAttrFilters`), applied as the `/annonser` `attrs` search param. */
  attrs?: string;
};

/**
 * Presentational rendering of the listing detail page — extracted from
 * `$kaupetCode.tsx` so it can be reused unmodified for the pre-publish
 * preview (see `PreviewDraftView`, rendered as an in-place overlay by the
 * wizard). Data-fetching and owner-only actions (stats, contact,
 * edit/delete/report) stay in the callers and are handed in as slots, so
 * this component has no Supabase or routing-history coupling of its own.
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
  /** Satt når kartpunktet er bedriftens eksakte besøksadresse. */
  exactLocationLabel?: string | null;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  knownIssues: string | null;
  noKnownIssues: boolean | null;
  maintenanceHistory: string | null;
  category: ListingDetailViewCategory;
  /** Category's own id — only needed in edit mode (generic attribute-panel
   * lookups, category-change modal); omitted by the pre-publish preview. */
  categoryId?: string | null;
  /** Full ancestor chain for the category breadcrumb, root first. Falls back
   * to a single plain category link (using `category` above) when omitted —
   * the pre-publish preview doesn't have the category tree on hand. */
  breadcrumb?: ListingDetailBreadcrumbItem[];
  images: { storage_path: string; sort_order: number; caption?: string | null }[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
  /** Whether this category uses delivery choices. False for Bil/MC and Båt. */
  requiresDeliveryMethod: boolean;
  /** Listing lifecycle status. Only the owner (and admins) can open a listing
   * that is not active, and without this nothing on the page said so — a sold
   * ad looked exactly like a live one. Omitted by the pre-publish preview. */
  listingStatus?: string | null;
  /** Persisted delivery capability for categories that use delivery choices. */
  canShip: boolean | null;
  /** Enables owner inline-editing: wraps the view in `ListingEditContext` and
   * turns editable regions into dashed-border/click-to-edit affordances.
   * Omitted (buyer view / no `editMode` prop) renders byte-for-byte
   * identical to before this feature existed. */
  editMode?: { context: ListingEditContextValue };
  /** 360°-bildesekvens tatt via mobilappen (Bil/MC-kategorier). Tom/utelatt
   * for annonser uten 360-opptak. */
  vehicle360Frames?: Vehicle360Frame[];
  vehicle360ImgUrls?: Record<string, string>;
  /** Edit/delete/report menu — real, non-owner viewers only. */
  actionsMenuSlot?: ReactNode;
  /** Views/favorites/promote panel — owner only. */
  ownerStatsSlot?: ReactNode;
  /** Contact-seller panel. */
  sellerContactSlot?: ReactNode;
  /** Live organization identity shown only when Proff branding is effective. */
  organizationBrand?: ListingOrganizationBrand;
  /** Optional related active organization listings section. */
  relatedListingsSlot?: ReactNode;
  /** Compact "Send melding"-button shown in the fixed mobile contact bar.
   * Omitted (e.g. for the owner's own listing, or the pre-publish preview)
   * hides the bar entirely. Web only — native has its own bottom nav. */
  stickyContactSlot?: ReactNode;
  /** Sticky banner shown instead of the above when this is a pre-publish preview. */
  previewBanner?: ReactNode;
  /** Mobilversjonen av siden inne i telefonrammen i annonseflyten: én kolonne
   * uansett vindusbredde (se `page-md:` i styles.css), kontaktlinjen fast
   * nederst i rammen i stedet for i vinduet, ikke noe kart, og grå streker
   * for det selgeren ikke har fylt ut ennå. */
  phonePreview?: boolean;
  /** Shows a "Tilbake til {label}" link above the breadcrumb, reading the
   * last saved /annonser search context for this session (see
   * last-search-context.ts). Only set by the real listing detail route —
   * omitted by the pre-publish preview, which isn't reached from a search. */
  enableBackToSearch?: boolean;
  /** Extra nodes rendered at the end of the view — used by `$kaupetCode.tsx`
   * for the owner-only vehicle-plate/category edit modals, which need
   * `ListingDetailView`'s children slot rather than a named prop since they
   * render as dialogs, not inline content. Omitted for buyers/preview. */
  children?: ReactNode;
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
  exactLocationLabel,
  createdAt,
  updatedAt,
  publishedAt,
  knownIssues,
  noKnownIssues,
  maintenanceHistory,
  category,
  categoryId,
  breadcrumb,
  images,
  imgUrls,
  attributes,
  actionsMenuSlot,
  requiresDeliveryMethod,
  listingStatus,
  canShip,
  vehicle360Frames,
  vehicle360ImgUrls,
  ownerStatsSlot,
  sellerContactSlot,
  organizationBrand,
  relatedListingsSlot,
  stickyContactSlot,
  previewBanner,
  phonePreview,
  enableBackToSearch,
  editMode,
  children,
}: ListingDetailViewProps) {
  const isNative = useIsNative();
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const closeMapOverlay = useCallback(() => setMapOverlayOpen(false), []);

  const sortedImages = images.slice().sort((a, b) => a.sort_order - b.sort_order);
  const has360 = !!vehicle360Frames && vehicle360Frames.length > 0;
  // Persistent kontakthandling er kjøperreisens primære konvertering — skal
  // ikke avhenge av at brukeren scroller forbi bilder/spesifikasjoner for å
  // finne selgerkortet. Vist på både native og mobilweb (samme fysiske
  // formfaktor); desktop web har allerede kontaktpanelet synlig i
  // sidekolonnen uten scroll, se page-md:hidden på selve baren under.
  const showStickyContact = !!stickyContactSlot;

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
  // Akselkombinasjon (bobil/lastebil/buss) — selgerens eget valg, ikke fra
  // SVV (som kun oppgir akseltall, ikke hvilken kombinasjon), så ingen
  // vehicleLookup-fallback slik driveType har.
  const axleConfigRaw = attributes.axle_config;
  const axleConfig = isVehicleListing && typeof axleConfigRaw === "string" ? axleConfigRaw : null;
  const avgiftOverrideRaw = attributes.omregistreringsavgift_override_kr;
  const avgiftFritatt = isVehicleListing && attributes.omregistreringsavgift_fritatt === true;
  const avgiftInkludert = isVehicleListing && attributes.omregistreringsavgift_inkludert === true;
  const omregistreringsavgiftKr = isVehicleListing
    ? typeof avgiftOverrideRaw === "number"
      ? avgiftOverrideRaw
      : computeOmregistreringsavgift(
          (category?.slug as VehicleLeafSlug) ?? null,
          vehicleLookup?.weight_kg ?? null,
          firstRegistrationYear(vehicleLookup?.first_registration_date),
          (attributes.avgiftskode_gruppe as AvgiftskodeGruppe | undefined) ?? null,
        )
    : null;

  /** True when the re-registration fee lands on the buyer on top of the
   * seller's asking price. Then, and only then, every price the buyer sees
   * is the total — otherwise the number in the search list would not be the
   * number they end up paying, and the ad and the list would disagree. */
  const buyerPaysAvgift =
    isVehicleListing && !avgiftFritatt && !avgiftInkludert && omregistreringsavgiftKr != null;

  const avgiftNote = avgiftFritatt
    ? "Fritatt for omregistreringsavgift"
    : avgiftInkludert
      ? "Omregistreringsavgift inkludert i kjøpesummen (dekkes av selger)"
      : null;
  /** Når kjøper betaler avgiften er totalprisen satt sammen av to beløp, og
   * begge fortjener sin egen linje i priskortet — en sammensatt setning
   * tvinger leseren til å regne selv. */
  const avgiftBreakdown = buyerPaysAvgift
    ? { sellerPriceKr: priceNok ?? 0, avgiftKr: omregistreringsavgiftKr! }
    : null;

  const totalPriceKr =
    isVehicleListing && priceNok != null
      ? priceNok + (avgiftFritatt || avgiftInkludert ? 0 : (omregistreringsavgiftKr ?? 0))
      : null;

  /** The number shown to the buyer everywhere on this page — matches
   * `displayPriceNok` in lib/format.ts, which the search cards already use. */
  const displayPriceKr = buyerPaysAvgift && priceNok != null ? totalPriceKr : priceNok;

  const priceLabel = isFree
    ? "Gis bort"
    : displayPriceKr != null
      ? `${displayPriceKr.toLocaleString("nb-NO")} kr`
      : phonePreview
        ? ""
        : "Pris ved henvendelse";

  /** Only non-active listings say anything — an active ad needs no badge. */
  const statusBadge =
    listingStatus === "sold"
      ? isFree
        ? "Gitt bort"
        : "Solgt"
      : listingStatus === "expired"
        ? "Utløpt"
        : listingStatus === "archived"
          ? "Arkivert"
          : null;

  const priceBlock = (
    <EditableField
      fieldKey="price"
      value={{ isFree, priceNok }}
      render={(v) => (
        <p className="font-display text-3xl font-semibold leading-tight text-primary">
          {v.isFree ? (
            "Gis bort"
          ) : v.priceNok != null ? (
            `${(buyerPaysAvgift ? v.priceNok + omregistreringsavgiftKr! : v.priceNok).toLocaleString("nb-NO")} kr`
          ) : phonePreview ? (
            <PlaceholderLine className="my-3 w-2/5" />
          ) : (
            "Pris ved henvendelse"
          )}
        </p>
      )}
      editRender={({ value: v, onChange, onCommit, onCancel }) => (
        <div
          className="flex items-center gap-2"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) onCommit();
          }}
        >
          <Checkbox
            id="edit-price-is-free"
            checked={v.isFree}
            onCheckedChange={(c) => onChange({ ...v, isFree: !!c })}
          />
          <Label htmlFor="edit-price-is-free" className="text-xs">
            Gis bort
          </Label>
          {!v.isFree && buyerPaysAvgift && (
            <span className="text-xs text-muted-foreground">Din pris, uten avgift:</span>
          )}
          {!v.isFree && (
            <Input
              type="number"
              min={0}
              className="h-8 w-28"
              aria-label="Pris i kroner"
              value={v.priceNok ?? ""}
              onChange={(e) =>
                onChange({ ...v, priceNok: e.target.value === "" ? null : Number(e.target.value) })
              }
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommit();
                if (e.key === "Escape") onCancel();
              }}
            />
          )}
        </div>
      )}
      onSave={async (v) => {
        await editMode?.context.saveField({
          group: "price",
          is_free: v.isFree,
          price_nok: v.isFree ? null : v.priceNok,
        });
      }}
    />
  );

  const contentBody = (
    <ListingDetailViewBody
      title={title}
      subtitle={subtitle}
      description={description}
      condition={condition}
      city={city}
      postalCode={postalCode}
      displayLat={displayLat}
      displayLng={displayLng}
      exactLocationLabel={exactLocationLabel}
      createdAt={createdAt}
      updatedAt={updatedAt}
      publishedAt={publishedAt}
      listingStatus={listingStatus}
      knownIssues={knownIssues}
      noKnownIssues={noKnownIssues}
      maintenanceHistory={maintenanceHistory}
      category={category}
      categoryId={categoryId ?? null}
      breadcrumb={breadcrumb}
      imgUrls={imgUrls}
      attributes={attributes}
      canShip={canShip ?? null}
      organizationBrand={organizationBrand}
      relatedListingsSlot={relatedListingsSlot}
      vehicle360ImgUrls={vehicle360ImgUrls}
      actionsMenuSlot={actionsMenuSlot}
      ownerStatsSlot={ownerStatsSlot}
      requiresDeliveryMethod={requiresDeliveryMethod}
      sellerContactSlot={sellerContactSlot}
      stickyContactSlot={stickyContactSlot}
      previewBanner={previewBanner}
      phonePreview={phonePreview}
      enableBackToSearch={enableBackToSearch}
      activeImage={activeImage}
      setActiveImage={setActiveImage}
      lightboxIndex={lightboxIndex}
      setLightboxIndex={setLightboxIndex}
      mapOverlayOpen={mapOverlayOpen}
      setMapOverlayOpen={setMapOverlayOpen}
      closeLightbox={closeLightbox}
      closeMapOverlay={closeMapOverlay}
      sortedImages={sortedImages}
      has360={has360}
      showStickyContact={showStickyContact}
      priceLabel={priceLabel}
      priceBlock={priceBlock}
      statusBadge={statusBadge}
      isVehicleListing={isVehicleListing}
      vehicleLookup={vehicleLookup}
      mileageKm={mileageKm}
      euControlExempt={euControlExempt}
      driveType={driveType}
      axleConfig={axleConfig}
      avgiftNote={avgiftNote}
      avgiftBreakdown={avgiftBreakdown}
      totalPriceKr={totalPriceKr}
      isNative={isNative}
    >
      {children}
    </ListingDetailViewBody>
  );

  return editMode ? (
    <ListingEditContext.Provider value={editMode.context}>
      {contentBody}
    </ListingEditContext.Provider>
  ) : (
    contentBody
  );
}

/**
 * Extracted from `ListingDetailView`'s original inline body so the parent
 * can compute the `ListingEditContext.Provider` wrapper (and the shared
 * `priceBlock`, which needs `EditableField`'s hook to run *inside* the
 * provider) around it. This function's body is otherwise an unmodified
 * continuation of the original render — nothing here changes buyer-view
 * output.
 */
function ListingDetailViewBody({
  title,
  subtitle,
  description,
  condition,
  city,
  postalCode,
  displayLat,
  displayLng,
  exactLocationLabel,
  createdAt,
  updatedAt,
  publishedAt,
  listingStatus,
  knownIssues,
  noKnownIssues,
  maintenanceHistory,
  category,
  categoryId,
  breadcrumb,
  imgUrls,
  attributes,
  requiresDeliveryMethod,
  canShip,
  vehicle360Frames,
  vehicle360ImgUrls,
  actionsMenuSlot,
  ownerStatsSlot,
  sellerContactSlot,
  organizationBrand,
  stickyContactSlot,
  relatedListingsSlot,
  previewBanner,
  phonePreview,
  enableBackToSearch,
  activeImage,
  setActiveImage,
  lightboxIndex,
  setLightboxIndex,
  mapOverlayOpen,
  setMapOverlayOpen,
  closeLightbox,
  closeMapOverlay,
  sortedImages,
  has360,
  showStickyContact,
  priceLabel,
  priceBlock,
  statusBadge,
  isVehicleListing,
  vehicleLookup,
  mileageKm,
  euControlExempt,
  driveType,
  axleConfig,
  avgiftNote,
  avgiftBreakdown,
  totalPriceKr,
  isNative,
  children,
}: {
  title: string;
  subtitle: string | null;
  description: string;
  condition: string | null;
  city: string | null;
  postalCode: string | null;
  displayLat: number | null;
  displayLng: number | null;
  /** Satt når kartpunktet er bedriftens eksakte besøksadresse. */
  exactLocationLabel?: string | null;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  listingStatus?: string | null;
  knownIssues: string | null;
  noKnownIssues: boolean | null;
  maintenanceHistory: string | null;
  category: ListingDetailViewCategory;
  categoryId: string | null;
  breadcrumb?: ListingDetailBreadcrumbItem[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
  requiresDeliveryMethod: boolean;
  canShip: boolean | null;
  vehicle360Frames?: Vehicle360Frame[];
  vehicle360ImgUrls?: Record<string, string>;
  actionsMenuSlot?: ReactNode;
  ownerStatsSlot?: ReactNode;
  sellerContactSlot?: ReactNode;
  organizationBrand?: ListingOrganizationBrand;
  relatedListingsSlot?: ReactNode;
  stickyContactSlot?: ReactNode;
  previewBanner?: ReactNode;
  phonePreview?: boolean;
  enableBackToSearch?: boolean;
  activeImage: number;
  setActiveImage: (i: number) => void;
  lightboxIndex: number | null;
  setLightboxIndex: (i: number | null) => void;
  mapOverlayOpen: boolean;
  setMapOverlayOpen: (v: boolean) => void;
  closeLightbox: () => void;
  closeMapOverlay: () => void;
  sortedImages: { storage_path: string; sort_order: number; caption?: string | null }[];
  has360: boolean;
  showStickyContact: boolean;
  priceLabel: string;
  priceBlock: ReactNode;
  statusBadge: string | null;
  isVehicleListing: boolean;
  vehicleLookup: ReturnType<typeof parseVehicleLookup>;
  mileageKm: number | null;
  euControlExempt: boolean | null;
  driveType: string | null;
  axleConfig: string | null;
  avgiftNote: string | null;
  avgiftBreakdown: { sellerPriceKr: number; avgiftKr: number } | null;
  totalPriceKr: number | null;
  isNative: boolean;
  children?: ReactNode;
}) {
  const editCtx = useListingEdit();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Native app requests a distinct layout for Bil og MC and Båter listings:
  // seller info promoted up under the spec grid instead of the bottom of
  // the sidebar (which native stacks below all main content). The plate
  // itself only ever renders for vehicle listings — boats have no plate.
  const isBoatListing = !isVehicleListing && isBoatAttributes(attributes);
  const nativeSpecLayout = isNative && (isVehicleListing || isBoatListing);
  const nativePlateUnderTitle = isNative && isVehicleListing;
  // Profileringen kommer fra organisasjonens lagrede profil og deles med konsollforhåndsvisningen.
  // Tilstand-etiketter er per kjøretøytype (se VEHICLE_CONDITIONS_BY_SLUG) —
  // faller tilbake til de generiske etikettene (via `?? v`/CONDITIONS der de
  // brukes) dersom slug mangler eller ikke finnes i tabellen.
  const vehicleLeafSlug = isVehicleListing ? (category?.slug as VehicleLeafSlug) : null;
  const hasGalleryContent = has360 || sortedImages.length > 0;
  const [wideGallery, setWideGallery] = useWideGallery();
  // Bredde-valget gjelder bare der siden faktisk har to kolonner. Under md
  // ville "én kolonne" bare flyttet prisen opp foran bildet uten å gjøre
  // galleriet smalere, så der beholdes full bredde uansett hva som er lagret.
  const isTwoColumn = useMediaQuery("(min-width: 768px)") && !phonePreview;
  const galleryInColumn = !wideGallery && isTwoColumn;
  const gallery = hasGalleryContent ? (
    <ImageGallery
      images={sortedImages}
      imgUrls={imgUrls}
      activeImage={activeImage}
      onSelect={setActiveImage}
      title={title}
      onImageClick={setLightboxIndex}
      thumbnailsOverlay={!galleryInColumn}
      vehicle360={
        has360 ? { frames: vehicle360Frames!, imgUrls: vehicle360ImgUrls ?? {} } : undefined
      }
    />
  ) : null;

  return (
    <div
      data-phone-preview={phonePreview || undefined}
      className={`mx-auto max-w-6xl px-4 py-8 ${showStickyContact && !phonePreview ? "pb-28 page-md:pb-8" : ""} ${phonePreview ? "pb-0" : ""}`}
    >
      {/* titleFadesIn: siden har allerede tittelen som stor <h1> rett under
          headeren — headertittelen toner inn først når den er scrollet vekk. */}
      {/* Inne i annonseflyten har skjemaet sin egen header. */}
      {!phonePreview && <NativePageHeader title={title} titleFadesIn />}
      {previewBanner}
      {enableBackToSearch && (
        <ClientOnly>
          <BackToSearchLink />
        </ClientOnly>
      )}
      <header data-preview-section="title" className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {(() => {
              const crumb =
                breadcrumb && breadcrumb.length > 0 ? (
                  <Breadcrumb>
                    <BreadcrumbList className="gap-1 text-xs uppercase tracking-wide page-sm:gap-1">
                      {breadcrumb.map((c, i) => (
                        <Fragment key={`${c.slug ?? "extra"}-${i}`}>
                          {i > 0 && <BreadcrumbSeparator />}
                          <BreadcrumbItem>
                            {c.slug == null ? (
                              <BreadcrumbPage className="uppercase tracking-wide">
                                {c.name_nb}
                              </BreadcrumbPage>
                            ) : (
                              <BreadcrumbLink asChild>
                                <Link
                                  to="/annonser"
                                  search={{
                                    q: "",
                                    category: c.slug,
                                    sort: "new",
                                    attrs: c.attrs ?? "",
                                  }}
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
                );
              if (editCtx?.editMode) {
                return (
                  <button
                    type="button"
                    onClick={() => editCtx.openCategoryModal()}
                    className="rounded-md border border-dashed border-border/60 px-2 py-1 text-left text-xs uppercase tracking-wide transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {breadcrumb?.map((c) => c.name_nb).join(" › ") ?? category?.name_nb}
                  </button>
                );
              }
              return crumb;
            })()}
            <div className="mt-1 flex items-center justify-between gap-3">
              {isVehicleListing ? (
                // Title is auto-generated from brand/model/year for Bil og MC
                // (never a free-text field in that category's wizard flow
                // either), so it's not editable here.
                <h1 className="min-w-0 flex-1 font-display text-3xl leading-tight tracking-tight">
                  {title}
                </h1>
              ) : (
                <EditableField
                  fieldKey="title"
                  value={title}
                  className="min-w-0 flex-1"
                  render={(v) => (
                    <h1 className="min-w-0 font-display text-3xl leading-tight tracking-tight">
                      {v}
                    </h1>
                  )}
                  editRender={({ value: v, onChange, onCommit, onCancel }) => (
                    <Input
                      value={v}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={() => onCommit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onCommit();
                        if (e.key === "Escape") onCancel();
                      }}
                      autoFocus
                      className="font-display text-2xl"
                    />
                  )}
                  validate={(v) => (v.trim().length < 5 ? "Tittel må være minst 5 tegn" : null)}
                  onSave={async (v) => {
                    await editCtx?.saveField({ group: "title", title: v.trim() });
                  }}
                />
              )}
            </div>
            {nativePlateUnderTitle && vehicleLookup?.registrationNumber && (
              <div className="mt-2">
                <RegistrationPlate
                  value={vehicleLookup.registrationNumber}
                  className="h-7"
                  editable={!!editCtx?.editMode}
                  onEdit={() => editCtx?.openVehicleLookupModal()}
                />
              </div>
            )}
            <EditableField
              fieldKey="subtitle"
              value={subtitle ?? ""}
              render={(v) =>
                v ? (
                  <p className="mt-1 text-sm text-muted-foreground">{v}</p>
                ) : editCtx?.editMode ? (
                  <p className="mt-1 text-sm italic text-muted-foreground/60">
                    Legg til en undertittel
                  </p>
                ) : null
              }
              editRender={({ value: v, onChange, onCommit, onCancel }) => (
                <Input
                  value={v}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={() => onCommit()}
                  placeholder="Undertittel (valgfritt)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommit();
                    if (e.key === "Escape") onCancel();
                  }}
                  autoFocus
                  className="mt-1"
                />
              )}
              onSave={async (v) => {
                await editCtx?.saveField({ group: "subtitle", subtitle: v.trim() || null });
              }}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {/* Skiltet hører sammen med tittelen, men står på samme linje som
                handlingene til høyre i stedet for på tittellinjen — ellers
                ligger de to på hver sin høyde i headeren. */}
            {isVehicleListing && !nativePlateUnderTitle && vehicleLookup?.registrationNumber && (
              <RegistrationPlate
                value={vehicleLookup.registrationNumber}
                className="h-7 shrink-0"
                editable={!!editCtx?.editMode}
                onEdit={() => editCtx?.openVehicleLookupModal()}
              />
            )}
            {/* Kun fra md og opp — under md er siden uansett én kolonne, så
                bredde-valget ville ikke gjort noe. Står utenfor
                actionsMenuSlot-betingelsen fordi menyen kun finnes for
                innloggede, mens bredden gjelder alle. */}
            {hasGalleryContent && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden page-md:inline-flex"
                aria-pressed={wideGallery}
                aria-label={
                  wideGallery ? "Vis galleriet i én kolonne" : "Vis galleriet i full bredde"
                }
                title={wideGallery ? "Vis galleriet i én kolonne" : "Vis galleriet i full bredde"}
                onClick={() => setWideGallery(!wideGallery)}
              >
                {wideGallery ? (
                  <Shrink className="size-4" aria-hidden />
                ) : (
                  <Expand className="size-4" aria-hidden />
                )}
              </Button>
            )}
            {actionsMenuSlot}
          </div>
        </div>
      </header>

      {/* Bildet er det viktigste i en annonse, så galleriet ligger over gridet
          og går i full bredde. Velger brukeren én kolonne, flyttes det inn i
          innholdskolonnen i stedet, slik at pris og sidepanel kommer opp ved
          siden av det. Uten bilder rendres det ikke i det hele tatt. */}
      {hasGalleryContent && !galleryInColumn && (
        <div data-preview-section="photos" className="mb-8">
          {gallery}
        </div>
      )}
      {!hasGalleryContent && phonePreview && (
        <div
          data-preview-section="photos"
          className="mb-8 mt-6 grid aspect-[4/3] place-items-center rounded-xl bg-foreground/5 text-xs text-muted-foreground"
        >
          Bilder vises her
        </div>
      )}

      {/* grid-rows-[auto_1fr]: prisraden tar bare høyden den trenger, ellers
          strekkes den og sidepanelet under får et tomrom over seg. */}
      <div className="mt-6 grid gap-8 page-md:grid-cols-[minmax(0,1fr)_20rem] page-md:grid-rows-[auto_1fr]">
        {/* Egen grid-posisjon øverst til høyre i stedet for et kort som flyter
            over bildet — og samtidig den ene varianten som dekker både med og
            uten bilder. På mobil kollapser gridet til DOM-rekkefølge, så
            prisen kommer rett under galleriet. */}
        <div data-preview-section="price" className="page-md:col-start-2 page-md:row-start-1">
          <div className="rounded-xl border border-border bg-card p-4">
            {statusBadge && <StatusBadge label={statusBadge} />}
            {avgiftBreakdown && (
              /* Samme etikettstil som tiles i faktarutenettet, ikke en
                 versal "eyebrow" — se F1 i docs/plans/ui-gjennomgang.md. */
              <p className="text-xs text-muted-foreground">Totalpris</p>
            )}
            {priceBlock}
            {avgiftBreakdown && (
              <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Selgers pris</dt>
                  <dd className="font-medium">
                    {avgiftBreakdown.sellerPriceKr.toLocaleString("nb-NO")} kr
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Omregistreringsavgift</dt>
                  <dd className="font-medium">
                    {avgiftBreakdown.avgiftKr.toLocaleString("nb-NO")} kr
                  </dd>
                </div>
                <p className="pt-1 text-xs leading-snug text-muted-foreground">
                  Avgiften betales av kjøper ved eierskifte.
                </p>
              </dl>
            )}
            {avgiftNote && (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">{avgiftNote}</p>
            )}
          </div>
        </div>

        <div className="min-w-0 page-md:col-start-1 page-md:row-start-1 page-md:row-span-2">
          {hasGalleryContent && galleryInColumn && (
            <div data-preview-section="photos" className="mb-8">
              {gallery}
            </div>
          )}
          {isVehicleListing && (
            <div data-preview-section="facts">
              <EditableRegion
                render={() => (
                  <VehicleInfoGrid
                    vehicleLookup={vehicleLookup}
                    mileageKm={mileageKm}
                    euControlExempt={euControlExempt}
                    driveType={driveType}
                    attributes={attributes}
                  />
                )}
                panel={({ close }) => (
                  <VehicleFactsPanel
                    mileageKm={mileageKm}
                    driveType={driveType}
                    euControlExempt={euControlExempt}
                    onClose={close}
                  />
                )}
              />
            </div>
          )}

          {isBoatListing && (
            <div data-preview-section="facts">
              {categoryId ? (
                <EditableRegion
                  render={() => <BoatInfoGrid attributes={attributes} />}
                  panel={({ close }) => (
                    <GenericAttributesPanel
                      categoryId={categoryId}
                      attributes={attributes}
                      onClose={close}
                    />
                  )}
                />
              ) : (
                <BoatInfoGrid attributes={attributes} />
              )}
            </div>
          )}
          {typeof attributes[PART_FITMENT_SCOPE_KEY] === "string" && (
            <PartFitmentSummary attributes={attributes} />
          )}

          {nativeSpecLayout && sellerContactSlot && <div className="mt-6">{sellerContactSlot}</div>}

          <EditableField
            fieldKey="description"
            value={description}
            render={(v) => (
              <section data-preview-section="description" className="mt-8">
                <h2 className="font-display text-xl">Beskrivelse</h2>
                {!v && phonePreview ? (
                  <div className="mt-4 space-y-2.5">
                    <PlaceholderLine className="w-11/12" />
                    <PlaceholderLine className="w-4/5" />
                    <PlaceholderLine className="w-2/5" />
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {v}
                  </p>
                )}
              </section>
            )}
            editRender={({ value: v, onChange, onCommit, onCancel }) => (
              <section className="mt-8">
                <h2 className="font-display text-xl">Beskrivelse</h2>
                <Textarea
                  className="mt-3"
                  rows={6}
                  value={v}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={() => onCommit()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") onCancel();
                  }}
                  autoFocus
                />
              </section>
            )}
            validate={(v) => (v.trim().length < 20 ? "Beskrivelsen må være minst 20 tegn" : null)}
            onSave={async (v) => {
              await editCtx?.saveField({ group: "description", description: v.trim() });
            }}
          />

          {!isVehicleListing &&
            isBoatAttributes(attributes) &&
            (categoryId ? (
              <EditableRegion
                render={() => <BoatExtraInfo attributes={attributes} />}
                panel={({ close }) => (
                  <GenericAttributesPanel
                    categoryId={categoryId}
                    attributes={attributes}
                    onClose={close}
                  />
                )}
              />
            ) : (
              <BoatExtraInfo attributes={attributes} />
            ))}

          {isVehicleListing && (
            <EditableRegion
              render={() => (
                <Fragment>
                  <section className="mt-8">
                    <h2 className="font-display text-xl">Kjente feil og mangler</h2>
                    {noKnownIssues ? (
                      <SellerNoKnownIssues />
                    ) : (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                        {knownIssues}
                      </p>
                    )}
                  </section>
                  {maintenanceHistory && (
                    <section className="mt-8">
                      <h2 className="font-display text-xl">Vedlikeholdshistorikk</h2>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                        {maintenanceHistory}
                      </p>
                    </section>
                  )}
                </Fragment>
              )}
              className="mt-8"
              panel={({ close }) => (
                <VehicleConditionPanel
                  knownIssues={knownIssues}
                  noKnownIssues={!!noKnownIssues}
                  maintenanceHistory={maintenanceHistory}
                  onClose={close}
                />
              )}
            />
          )}

          {isVehicleListing && (
            <EditableRegion
              render={() => (
                <section className="mt-8">
                  <h2 className="font-display text-xl">Utstyr</h2>
                  <VehicleEquipmentList attributes={attributes} />
                  <VehicleTechTable
                    vehicleLookup={vehicleLookup}
                    mileageKm={mileageKm}
                    euControlExempt={euControlExempt}
                    driveType={driveType}
                    axleConfig={axleConfig}
                    condition={condition}
                    vehicleLeafSlug={vehicleLeafSlug}
                  />
                  <LoanCalculator totalPriceKr={totalPriceKr} />
                </section>
              )}
              className="mt-8"
              panel={({ close }) => (
                <VehicleEquipmentPanel attributes={attributes} onClose={close} />
              )}
            />
          )}

          {/* Boat attributes already have a direct edit entry point via the
              BoatInfoGrid/BoatExtraInfo regions above — this fallback only
              covers non-vehicle, non-boat categories with no dedicated
              display component of their own. Rendered for everyone, not just
              in edit mode: these are required fields in the wizard, so
              hiding them from buyers made the whole step pointless. */}
          {!isVehicleListing &&
            !isBoatAttributes(attributes) &&
            categoryId &&
            (editCtx?.editMode ? (
              <EditableRegion
                className="mt-8"
                render={() => (
                  <GenericAttributesGrid
                    categoryId={categoryId}
                    attributes={attributes}
                    emptyHint="Klikk for å redigere"
                  />
                )}
                panel={({ close }) => (
                  <GenericAttributesPanel
                    categoryId={categoryId}
                    attributes={attributes}
                    onClose={close}
                  />
                )}
              />
            ) : (
              <div data-preview-section="facts">
                <GenericAttributesGrid categoryId={categoryId} attributes={attributes} />
              </div>
            ))}
        </div>

        <aside className="@container space-y-5 page-md:col-start-2 page-md:row-start-2">
          {organizationBrand && <ProffListingHeader organization={organizationBrand} />}
          {(() => {
            const { label, dateStr } = getListingDateMeta(
              listingStatus,
              publishedAt,
              createdAt,
              updatedAt,
            );

            return (
              <dl
                data-preview-section="location"
                className="density-data grid grid-cols-2 gap-3 border-y border-border text-sm @sm:grid-cols-3"
              >
                {/* Kjøretøy har tilstand fylt ut allerede fra opprettelsen (se
                    VehicleConditionGroup), med kjøretøytype-spesifikke etiketter
                    (se VEHICLE_CONDITIONS_BY_SLUG) — så tilen vises normalt for
                    dem også. Skjules kun i redigeringsmodus uten eksisterende
                    verdi og ukjent slug, der vi ikke har noe alternativlisté å
                    tilby. */}
                {(condition || (editCtx?.editMode && (!isVehicleListing || vehicleLeafSlug))) && (
                  <EditableField
                    fieldKey="condition"
                    value={condition}
                    render={(v) =>
                      v ? (
                        <div>
                          <dt className="text-muted-foreground">Tilstand</dt>
                          <dd className="font-medium">
                            {(vehicleLeafSlug
                              ? (VEHICLE_CONDITION_LABEL_BY_SLUG[vehicleLeafSlug] as Record<
                                  string,
                                  string
                                >)
                              : CONDITION_LABEL)[v] ?? v}
                          </dd>
                        </div>
                      ) : (
                        <div>
                          <dt className="text-muted-foreground">Tilstand</dt>
                          <dd className="font-medium text-muted-foreground/70">Ikke satt</dd>
                        </div>
                      )
                    }
                    editRender={({ value: v, onChange, onCommit }) => (
                      <div>
                        <dt className="text-muted-foreground">Tilstand</dt>
                        <Select
                          value={v ?? undefined}
                          onValueChange={(next) => {
                            onChange(next);
                            onCommit(next);
                          }}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Velg tilstand" />
                          </SelectTrigger>
                          <SelectContent>
                            {(vehicleLeafSlug
                              ? VEHICLE_CONDITIONS_BY_SLUG[vehicleLeafSlug]
                              : CONDITIONS
                            ).map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    onSave={async (v) => {
                      await editCtx?.saveField({ group: "condition", condition: v });
                    }}
                  />
                )}
                <EditableRegion
                  render={() => (
                    <div>
                      <dt className="text-muted-foreground">Lokasjon</dt>
                      <dd className="flex items-center gap-1 font-medium">
                        <MapPin className="size-3.5 text-muted-foreground" />
                        {city ||
                          postalCode ||
                          (phonePreview ? <PlaceholderLine className="w-16" /> : "Ikke oppgitt")}
                      </dd>
                    </div>
                  )}
                  onOpen={() => {
                    if (editCtx?.openLocationEditor) return editCtx.openLocationEditor();
                    setPendingCoords(
                      displayLat != null && displayLng != null
                        ? { lat: displayLat, lng: displayLng }
                        : null,
                    );
                    setLocationPickerOpen(true);
                  }}
                  panel={() => null}
                />
                <div>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{dateStr}</dd>
                </div>
                {requiresDeliveryMethod && !editCtx?.editMode && (
                  <div>
                    <dt className="text-muted-foreground">Levering</dt>
                    <dd className="font-medium">
                      {canShip === true ? (
                        "Kan sendes"
                      ) : canShip === false ? (
                        "Kun henting"
                      ) : phonePreview ? (
                        <PlaceholderLine className="mt-2 w-16" />
                      ) : (
                        "Ikke oppgitt"
                      )}
                    </dd>
                  </div>
                )}
                {editCtx?.editMode && editCtx.behavior.requiresDeliveryMethod && (
                  <EditableField
                    fieldKey="delivery"
                    value={canShip}
                    render={(v) => (
                      <div>
                        <dt className="text-muted-foreground">Levering</dt>
                        <dd className="font-medium">
                          {v === true ? "Kan sendes" : v === false ? "Kun henting" : "Ikke satt"}
                        </dd>
                      </div>
                    )}
                    editRender={({ value: v, onChange, onCommit }) => (
                      <div>
                        <dt className="text-muted-foreground">Levering</dt>
                        <Select
                          value={v === true ? "ship" : v === false ? "pickup" : undefined}
                          onValueChange={(next) => {
                            const nextValue = next !== "pickup";
                            onChange(nextValue);
                            onCommit(nextValue);
                          }}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Velg" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pickup">Kun henting</SelectItem>
                            <SelectItem value="ship">Frakt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    onSave={async (v) => {
                      await editCtx?.saveField({ group: "delivery", can_ship: v });
                    }}
                  />
                )}
              </dl>
            );
          })()}

          {locationPickerOpen && pendingCoords && (
            <ClientOnly>
              <Suspense fallback={<LightboxLoadingFallback />}>
                <FullscreenLocationPicker
                  lat={pendingCoords.lat}
                  lng={pendingCoords.lng}
                  onConfirm={async (next) => {
                    setLocationPickerOpen(false);
                    await editCtx?.saveField({
                      group: "location",
                      postal_code: postalCode ?? null,
                      city: city ?? null,
                      lat: next.lat,
                      lng: next.lng,
                    });
                  }}
                  onClose={() => setLocationPickerOpen(false)}
                />
              </Suspense>
            </ClientOnly>
          )}

          {ownerStatsSlot}
          {!nativeSpecLayout && sellerContactSlot}
        </aside>
      </div>
      {relatedListingsSlot}

      {!phonePreview && displayLat != null && displayLng != null && (
        <section className="mt-10">
          <button
            type="button"
            onClick={() => setMapOverlayOpen(true)}
            aria-label="Se kart i fullskjerm"
            className="relative block h-80 w-full cursor-pointer overflow-hidden rounded-2xl border border-border"
          >
            <ClientOnly fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                <ListingDetailMap
                  lat={displayLat}
                  lng={displayLng}
                  interactive={false}
                  exact={!!exactLocationLabel}
                />
              </Suspense>
            </ClientOnly>
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg">
              <Maximize2 className="size-3.5" />
              Se i fullskjerm
            </span>
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            {exactLocationLabel
              ? `Besøksadresse: ${exactLocationLabel}`
              : "Lokasjonen er omtrentlig. Gjenstanden befinner seg ikke nødvendigvis innenfor det markerte området."}
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
            vehicle360={
              has360 ? { frames: vehicle360Frames!, imgUrls: vehicle360ImgUrls ?? {} } : undefined
            }
          />
        </Suspense>
      )}

      <ClientOnly>
        {mapOverlayOpen && displayLat != null && displayLng != null && (
          <Suspense fallback={<LightboxLoadingFallback />}>
            <MapOverlay
              lat={displayLat}
              lng={displayLng}
              exactLocationLabel={exactLocationLabel}
              onClose={closeMapOverlay}
            />
          </Suspense>
        )}
      </ClientOnly>

      {showStickyContact && phonePreview && (
        <div className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          {priceLabel ? (
            <p className="font-display text-lg leading-none text-primary">{priceLabel}</p>
          ) : (
            <PlaceholderLine className="w-20" />
          )}
          {stickyContactSlot}
        </div>
      )}
      {showStickyContact && !phonePreview && (
        <div
          className="px-safe fixed inset-x-0 z-40 border-t border-border bg-background/95 py-3 backdrop-blur page-md:hidden"
          style={
            isNative
              ? // Bunnavigasjonen (AppBottomNav) ligger fast under denne
                // siden med z-50 — baren må stå over den, ikke bak den, og
                // trenger ikke egen safe-area-padding siden tab-baren
                // allerede reserverer den.
                { bottom: "var(--app-bottom-nav-h)" }
              : {
                  bottom: 0,
                  paddingBottom: "calc(var(--safe-bottom) + 0.75rem)",
                }
          }
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="font-display text-lg leading-none text-primary">{priceLabel}</p>
            {stickyContactSlot}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
