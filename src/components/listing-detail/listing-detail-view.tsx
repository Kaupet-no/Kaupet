import { Fragment, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPin, Maximize2 } from "lucide-react";

import { useIsNative } from "@/hooks/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import { type Vehicle360Frame } from "@/components/listing-detail/vehicle/vehicle-360-viewer";
import { VehicleEquipmentList } from "@/components/listing-detail/vehicle/vehicle-equipment-list";
import { VehicleInfoGrid } from "@/components/listing-detail/vehicle/vehicle-info-grid";
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
import {
  CONDITION_LABEL,
  VEHICLE_CONDITION_LABEL,
  CONDITIONS,
  VEHICLE_CONDITIONS,
} from "@/lib/constants";
import {
  VEHICLE_LEAF_SLUGS,
  computeOmregistreringsavgift,
  type AvgiftskodeGruppe,
  type VehicleLeafSlug,
} from "@/lib/vehicle/vehicle-classification";
import { firstRegistrationYear } from "@/lib/vehicle/first-registration";
import { parseVehicleLookup } from "@/lib/vehicle/parse-vehicle-lookup";
import { DRIVE_TYPE_OPTIONS } from "@/features/listing-creation/field-groups/vehicle-confirm";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullscreenLocationPicker } from "@/components/fullscreen-location-picker";
import {
  AttributeFields,
  useAllCategoryFilters,
  type AttributeMap,
} from "@/components/attribute-fields";
import { VEHICLE_EQUIPMENT_FILTER_KEYS } from "@/lib/category-filters";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ListingEditContext,
  useListingEdit,
  type ListingEditContextValue,
} from "@/features/listing-edit/edit-mode-context";
import { EditableField } from "@/features/listing-edit/editable-field";
import { EditableRegion } from "@/features/listing-edit/editable-region";

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
  /** Delivery method — not shown to buyers today, only used as an inline-
   * editable field for the owner (edit mode). */
  canShip?: boolean | null;
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
  /** Compact "Send melding"-button shown in the fixed mobile contact bar.
   * Omitted (e.g. for the owner's own listing, or the pre-publish preview)
   * hides the bar entirely. Web only — native has its own bottom nav. */
  stickyContactSlot?: ReactNode;
  /** Sticky banner shown instead of the above when this is a pre-publish preview. */
  previewBanner?: ReactNode;
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
  canShip,
  vehicle360Frames,
  vehicle360ImgUrls,
  actionsMenuSlot,
  ownerStatsSlot,
  sellerContactSlot,
  stickyContactSlot,
  previewBanner,
  editMode,
  children,
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
          firstRegistrationYear(vehicleLookup?.first_registration_date),
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

  const totalPriceKr =
    isVehicleListing && priceNok != null
      ? priceNok + (avgiftFritatt || avgiftInkludert ? 0 : (omregistreringsavgiftKr ?? 0))
      : null;

  const priceBlock = (
    <EditableField
      fieldKey="price"
      value={{ isFree, priceNok }}
      render={(v) => (
        <p className="font-display text-xl leading-none text-primary">
          {v.isFree
            ? "Gis bort"
            : v.priceNok != null
              ? `${v.priceNok.toLocaleString("nb-NO")} kr`
              : "Pris ved henvendelse"}
        </p>
      )}
      editRender={({ value: v, onChange, onCommit, onCancel }) => (
        <div
          className="flex items-center gap-2"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) onCommit();
          }}
        >
          <Checkbox checked={v.isFree} onCheckedChange={(c) => onChange({ ...v, isFree: !!c })} />
          <Label className="text-xs">Gis bort</Label>
          {!v.isFree && (
            <Input
              type="number"
              min={0}
              className="h-8 w-28"
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
      createdAt={createdAt}
      updatedAt={updatedAt}
      publishedAt={publishedAt}
      knownIssues={knownIssues}
      noKnownIssues={noKnownIssues}
      maintenanceHistory={maintenanceHistory}
      category={category}
      categoryId={categoryId ?? null}
      breadcrumb={breadcrumb}
      imgUrls={imgUrls}
      attributes={attributes}
      canShip={canShip ?? null}
      vehicle360Frames={vehicle360Frames}
      vehicle360ImgUrls={vehicle360ImgUrls}
      actionsMenuSlot={actionsMenuSlot}
      ownerStatsSlot={ownerStatsSlot}
      sellerContactSlot={sellerContactSlot}
      stickyContactSlot={stickyContactSlot}
      previewBanner={previewBanner}
      activeImage={activeImage}
      setActiveImage={setActiveImage}
      mounted={mounted}
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
      isVehicleListing={isVehicleListing}
      vehicleLookup={vehicleLookup}
      mileageKm={mileageKm}
      euControlExempt={euControlExempt}
      driveType={driveType}
      avgiftNote={avgiftNote}
      totalPriceKr={totalPriceKr}
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
  createdAt,
  updatedAt,
  publishedAt,
  knownIssues,
  noKnownIssues,
  maintenanceHistory,
  category,
  categoryId,
  breadcrumb,
  imgUrls,
  attributes,
  canShip,
  vehicle360Frames,
  vehicle360ImgUrls,
  actionsMenuSlot,
  ownerStatsSlot,
  sellerContactSlot,
  stickyContactSlot,
  previewBanner,
  activeImage,
  setActiveImage,
  mounted,
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
  isVehicleListing,
  vehicleLookup,
  mileageKm,
  euControlExempt,
  driveType,
  avgiftNote,
  totalPriceKr,
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
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  knownIssues: string | null;
  noKnownIssues: boolean | null;
  maintenanceHistory: string | null;
  category: ListingDetailViewCategory;
  categoryId: string | null;
  breadcrumb?: ListingDetailBreadcrumbItem[];
  imgUrls: Record<string, string>;
  attributes: Record<string, unknown>;
  canShip: boolean | null;
  vehicle360Frames?: Vehicle360Frame[];
  vehicle360ImgUrls?: Record<string, string>;
  actionsMenuSlot?: ReactNode;
  ownerStatsSlot?: ReactNode;
  sellerContactSlot?: ReactNode;
  stickyContactSlot?: ReactNode;
  previewBanner?: ReactNode;
  activeImage: number;
  setActiveImage: (i: number) => void;
  mounted: boolean;
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
  isVehicleListing: boolean;
  vehicleLookup: ReturnType<typeof parseVehicleLookup>;
  mileageKm: number | null;
  euControlExempt: boolean | null;
  driveType: string | null;
  avgiftNote: string | null;
  totalPriceKr: number | null;
  children?: ReactNode;
}) {
  const editCtx = useListingEdit();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div className={`mx-auto max-w-6xl px-4 py-8 ${showStickyContact ? "pb-28 md:pb-8" : ""}`}>
      <NativePageHeader title={title} />
      {previewBanner}

      <header className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {(() => {
              const crumb =
                breadcrumb && breadcrumb.length > 0 ? (
                  <Breadcrumb>
                    <BreadcrumbList className="gap-1 text-xs uppercase tracking-wide sm:gap-1">
                      {breadcrumb.map((c, i) => (
                        <Fragment key={c.slug ?? `extra-${i}`}>
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
              if (!editCtx?.editMode) return crumb;
              return (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => editCtx.openCategoryModal()}
                  className="inline-block cursor-pointer rounded-md border border-dashed border-border/60 transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  {crumb}
                </span>
              );
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
                      onBlur={onCommit}
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
              {isVehicleListing && vehicleLookup?.registrationNumber && (
                <RegistrationPlate
                  value={vehicleLookup.registrationNumber}
                  className="h-7 shrink-0"
                  editable={!!editCtx?.editMode}
                  onEdit={() => editCtx?.openVehicleLookupModal()}
                />
              )}
            </div>
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
                  onBlur={onCommit}
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
          {actionsMenuSlot && <div className="shrink-0 pt-0.5">{actionsMenuSlot}</div>}
        </div>
      </header>

      <div className="mt-6 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-8">
            <ImageGallery
              images={sortedImages}
              imgUrls={imgUrls}
              activeImage={activeImage}
              onSelect={setActiveImage}
              title={title}
              onImageClick={has360 || sortedImages.length > 0 ? setLightboxIndex : undefined}
              vehicle360={
                has360 ? { frames: vehicle360Frames!, imgUrls: vehicle360ImgUrls ?? {} } : undefined
              }
              overlaySlot={
                (has360 || sortedImages.length > 0) && (
                  <div className="absolute -bottom-8 left-4 max-w-[calc(100%-2rem)] rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
                    {priceBlock}
                    {avgiftNote && (
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">
                        {avgiftNote}
                      </p>
                    )}
                  </div>
                )
              }
            />
          </div>

          {!has360 && sortedImages.length === 0 && (
            <div>
              {priceBlock}
              {avgiftNote && <p className="mt-1 text-xs text-muted-foreground">{avgiftNote}</p>}
            </div>
          )}

          {isVehicleListing && (
            <EditableRegion
              render={() => (
                <VehicleInfoGrid
                  vehicleLookup={vehicleLookup}
                  mileageKm={mileageKm}
                  euControlExempt={euControlExempt}
                  driveType={driveType}
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
          )}

          <EditableField
            fieldKey="description"
            value={description}
            render={(v) => (
              <section className="mt-8">
                <h2 className="font-display text-xl">Beskrivelse</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {v}
                </p>
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
                  onBlur={onCommit}
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

          {isVehicleListing && (
            <EditableRegion
              render={() => (
                <Fragment>
                  <section className="mt-8">
                    <h2 className="font-display text-xl">Kjente feil og mangler</h2>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {noKnownIssues
                        ? "Ingen kjente feil eller mangler oppgitt av selger"
                        : knownIssues}
                    </p>
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

          {!isVehicleListing && editCtx?.editMode && categoryId && (
            <EditableRegion
              className="mt-8"
              render={() => (
                <section className="mt-8">
                  <h2 className="font-display text-xl">Egenskaper</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Klikk for å redigere</p>
                </section>
              )}
              panel={({ close }) => (
                <GenericAttributesPanel
                  categoryId={categoryId}
                  attributes={attributes}
                  onClose={close}
                />
              )}
            />
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
                {/* Vehicles never have a "condition" field group in their category
                    flow (see category_flows for "Bil og MC") — their condition is
                    represented instead by the vehicle-condition panel (known
                    issues/maintenance history) and the SVV lookup data, so this
                    tile is hidden in edit mode for vehicle listings. Legacy data
                    with a stray value is still shown read-only. */}
                {(condition || (editCtx?.editMode && !isVehicleListing)) && (
                  <EditableField
                    fieldKey="condition"
                    value={condition}
                    render={(v) =>
                      v ? (
                        <div>
                          <dt className="text-muted-foreground">Tilstand</dt>
                          <dd className="font-medium">
                            {(isVehicleListing ? VEHICLE_CONDITION_LABEL : CONDITION_LABEL)[
                              v as keyof typeof CONDITION_LABEL
                            ] ?? v}
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
                          }}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Velg tilstand" />
                          </SelectTrigger>
                          <SelectContent>
                            {(isVehicleListing ? VEHICLE_CONDITIONS : CONDITIONS).map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-1 h-7"
                          onClick={onCommit}
                        >
                          Lagre
                        </Button>
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
                        {city || postalCode || "Ikke oppgitt"}
                      </dd>
                    </div>
                  )}
                  onOpen={() => {
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
                {editCtx?.editMode && editCtx.behavior.requiresDeliveryMethod && (
                  <EditableField
                    fieldKey="delivery"
                    value={canShip}
                    render={(v) => (
                      <div>
                        <dt className="text-muted-foreground">Levering</dt>
                        <dd className="font-medium">
                          {v === true ? "Frakt" : v === false ? "Kun henting" : "Ikke satt"}
                        </dd>
                      </div>
                    )}
                    editRender={({ value: v, onChange, onCommit }) => (
                      <div>
                        <dt className="text-muted-foreground">Levering</dt>
                        <Select
                          value={v === true ? "ship" : v === false ? "pickup" : undefined}
                          onValueChange={(next) => onChange(next !== "pickup")}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Velg" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pickup">Kun henting</SelectItem>
                            <SelectItem value="ship">Frakt</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-1 h-7"
                          onClick={onCommit}
                        >
                          Lagre
                        </Button>
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
          )}

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
            vehicle360={
              has360 ? { frames: vehicle360Frames!, imgUrls: vehicle360ImgUrls ?? {} } : undefined
            }
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
      {children}
    </div>
  );
}

/** Inline panel for editing vehicle spec facts (`VehicleInfoGrid`'s
 * seller-overridable subset: kilometerstand, hjuldrift, EU-kontroll
 * fritatt) — the rest of `VehicleInfoGrid` comes straight from the SVV
 * snapshot (`vehicle_lookup`), which is only refreshed via the plate modal. */
function VehicleFactsPanel({
  mileageKm,
  driveType,
  euControlExempt,
  onClose,
}: {
  mileageKm: number | null;
  driveType: string | null;
  euControlExempt: boolean | null;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const [km, setKm] = useState(mileageKm != null ? String(mileageKm) : "");
  const [drive, setDrive] = useState(driveType ?? "");
  const [exempt, setExempt] = useState(!!euControlExempt);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const attrs: Record<string, unknown> = { eu_control_exempt: exempt };
      if (km.trim() !== "") attrs.mileage_km = Number(km);
      if (drive.trim() !== "") attrs.drive_type = drive.trim();
      await editCtx?.saveField({ group: "attributes", attributes: attrs });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        Resterende felter hentes direkte fra Statens vegvesen sitt kjøretøyregister og kan ikke
        endres her.
      </p>
      <div>
        <Label htmlFor="ef-km">Kilometerstand</Label>
        <Input
          id="ef-km"
          type="number"
          min={0}
          value={km}
          onChange={(e) => setKm(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="ef-drive">Hjuldrift</Label>
        <Select value={drive} onValueChange={setDrive}>
          <SelectTrigger id="ef-drive">
            <SelectValue placeholder="Velg…" />
          </SelectTrigger>
          <SelectContent>
            {DRIVE_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={exempt} onCheckedChange={(c) => setExempt(!!c)} id="ef-eu" />
        <Label htmlFor="ef-eu">Fritatt for EU-kontroll</Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Avbryt
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Lagre
        </Button>
      </div>
    </div>
  );
}

/** Inline panel for the grouped "Kjente feil / vedlikeholdshistorikk" save
 * (all three fields commit together, mirroring the old field-group). */
function VehicleConditionPanel({
  knownIssues,
  noKnownIssues,
  maintenanceHistory,
  onClose,
}: {
  knownIssues: string | null;
  noKnownIssues: boolean;
  maintenanceHistory: string | null;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const [issues, setIssues] = useState(knownIssues ?? "");
  const [none, setNone] = useState(noKnownIssues);
  const [maintenance, setMaintenance] = useState(maintenanceHistory ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!none && !issues.trim()) return;
    setSaving(true);
    try {
      await editCtx?.saveField({
        group: "vehicle-condition",
        known_issues: none ? null : issues.trim() || null,
        no_known_issues: none,
        maintenance_history: maintenance.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Checkbox checked={none} onCheckedChange={(c) => setNone(!!c)} id="vc-none" />
        <Label htmlFor="vc-none">Ingen kjente feil eller mangler</Label>
      </div>
      {!none && (
        <div>
          <Label htmlFor="vc-issues">Kjente feil og mangler</Label>
          <Textarea
            id="vc-issues"
            rows={4}
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
          />
        </div>
      )}
      <div>
        <Label htmlFor="vc-maint">Vedlikeholdshistorikk</Label>
        <Textarea
          id="vc-maint"
          rows={4}
          value={maintenance}
          onChange={(e) => setMaintenance(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Avbryt
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Lagre
        </Button>
      </div>
    </div>
  );
}

/** Inline panel for the vehicle equipment checklist — reuses the same
 * `category_filters` rows (`utstyr_*` keys) as `VehicleEquipmentList`. */
function VehicleEquipmentPanel({
  attributes,
  onClose,
}: {
  attributes: Record<string, unknown>;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const { data: allFilters } = useAllCategoryFilters();
  const [values, setValues] = useState<AttributeMap>(() => {
    const init: AttributeMap = {};
    for (const key of VEHICLE_EQUIPMENT_FILTER_KEYS) {
      const v = attributes[key];
      if (Array.isArray(v)) init[key] = v as string[];
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  const equipmentFilters = (allFilters ?? []).filter((f) =>
    (VEHICLE_EQUIPMENT_FILTER_KEYS as readonly string[]).includes(f.key),
  );

  function toggle(key: string, optionValue: string) {
    setValues((curr) => {
      const list = Array.isArray(curr[key]) ? [...(curr[key] as string[])] : [];
      const idx = list.indexOf(optionValue);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(optionValue);
      return { ...curr, [key]: list };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await editCtx?.saveField({ group: "attributes", attributes: values });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
      {equipmentFilters.map((f) => (
        <div key={f.key}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {f.label_nb}
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-sm @sm:grid-cols-2">
            {(f.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-1.5">
                <Checkbox
                  checked={
                    Array.isArray(values[f.key]) && (values[f.key] as string[]).includes(o.value)
                  }
                  onCheckedChange={() => toggle(f.key, o.value)}
                />
                {o.label_nb}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Avbryt
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Lagre
        </Button>
      </div>
    </div>
  );
}

/** Inline panel for generic (non-vehicle) category attributes — reuses
 * `AttributeFields` (the same per-filter inputs the create wizard uses). */
function GenericAttributesPanel({
  categoryId,
  attributes,
  onClose,
}: {
  categoryId: string;
  attributes: Record<string, unknown>;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const [values, setValues] = useState<AttributeMap>(attributes as AttributeMap);
  const [saving, setSaving] = useState(false);
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, parent_id");
      if (error) throw error;
      return data;
    },
  });

  async function save() {
    setSaving(true);
    try {
      await editCtx?.saveField({ group: "attributes", attributes: values });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <AttributeFields
        categoryId={categoryId}
        categories={categories ?? []}
        value={values}
        onChange={setValues}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Avbryt
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Lagre
        </Button>
      </div>
    </div>
  );
}
