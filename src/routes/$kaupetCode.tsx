import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reconcilePromotionPayment } from "@/lib/promotions.functions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { z } from "zod";
import { useIsNative } from "@/hooks/use-is-native";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsModerator } from "@/hooks/use-is-moderator";
import { ListingActionsMenu } from "@/components/listing-detail/listing-actions-menu";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CategoryLandingPage } from "@/components/category-landing-page";
import { breadcrumbPath, buildTree, type Category } from "@/lib/categories";
import { encodeAttrFilters } from "@/features/listing-search/search-schema";
import { normalizeSlugForMatch } from "@/lib/slug";

import { searchSchema } from "@/features/listing-search/search-schema";
import { signListingImageUrls, signVehicle360FrameUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerStatsPanel } from "@/components/listing-detail/owner-stats-panel";
import { SellerContactPanel } from "@/components/listing-detail/seller-contact-panel";
import type { SellerIdentity } from "@/components/listing-detail/seller-contact-panel";
import { ListingDetailView } from "@/components/listing-detail/listing-detail-view";
import type { ListingOrganizationBrand } from "@/components/listing-detail/listing-detail-view";
import { getCategoryBehavior } from "@/lib/category-behavior";
import {
  genericBrandFilterFor,
  isBoatCategory,
  vehicleCategoryGroupFor,
} from "@/lib/category-filters";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { useCategories } from "@/hooks/use-categories";
import { useListingEditMutations } from "@/features/listing-edit/use-listing-edit-mutations";
import { VehiclePlateEditDialog } from "@/features/listing-edit/vehicle-plate-edit-dialog";
import { CategoryChangeDialog } from "@/features/listing-edit/category-change-dialog";
import type { ListingEditContextValue } from "@/features/listing-edit/edit-mode-context";
import { ListingDetailSkeleton } from "@/components/listing-detail-skeleton";
import { Vehicle360CaptureLauncher } from "@/components/vehicle-360-capture-launcher";
import { currentReturnTo } from "@/lib/auth-return";
import { savePendingAuthIntent, takePendingAuthIntent } from "@/lib/pending-auth-intent";
import { trackProductEvent } from "@/lib/product-analytics";
import { logListingView } from "@/lib/listing-views.functions";
import { parseVehicleLookup } from "@/lib/vehicle/parse-vehicle-lookup";
import { ListingCard } from "@/components/listing-card";
import { toListingCardData } from "@/lib/listing-card-data";

export const Route = createFileRoute("/$kaupetCode")({
  validateSearch: searchSchema.extend({
    promotion: z.string().optional(),
    promo_id: z.string().optional(),
    // Slug of a descendant category to scope the page to, without leaving
    // this URL — e.g. Interiør > Møbler > Sofa still lands on /interiør.
    sub: z.string().optional(),
    // Owner inline-editing toggle — a search param (not local state) so it
    // survives a reload while editing.
    edit: z.coerce.boolean().optional(),
  }),
  loader: async ({ params }) => {
    // A single dynamic root segment serves two purposes: an 8-digit code is
    // always a listing (kaupet-koder are numeric by construction), anything
    // else is looked up as a main category's landing page slug. Two separate
    // routes at "/$..." would be ambiguous, so both live in this one loader.
    if (/^[0-9]{8}$/.test(params.kaupetCode)) {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, description, price_nok, is_free, condition, city, updated_at, published_at, status",
        )
        .eq("kaupet_code", params.kaupetCode)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return { kind: "listing" as const, listing: data };
    }

    const { data: mains, error: catError } = await supabase
      .from("categories")
      .select("id, slug, name_nb, parent_id, icon, color")
      .eq("is_hidden", false)
      .is("parent_id", null);
    if (catError) throw catError;
    const exact = (mains ?? []).find((c) => c.slug === params.kaupetCode);
    const normalizedSlug = normalizeSlugForMatch(params.kaupetCode);
    const category =
      exact ?? (mains ?? []).find((c) => normalizeSlugForMatch(c.slug) === normalizedSlug);
    if (!category) throw notFound();
    return { kind: "category" as const, category: category as Category };
  },
  head: ({ params, loaderData }) => {
    if (loaderData?.kind === "category") {
      const c = loaderData.category;
      const title = `${c.name_nb} — kjøp og selg brukt på Kaupet.no`;
      const description = `Se annonser i ${c.name_nb} på Kaupet.no. Kjøp og selg brukt trygt og enkelt.`;
      const url = `https://kaupet.no/${c.slug}`;
      return {
        meta: [
          { title },
          { name: "description", content: description },
          { property: "og:title", content: title },
          { property: "og:description", content: description },
          { property: "og:url", content: url },
        ],
        links: [{ rel: "canonical", href: url }],
        scripts: [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Alle kategorier",
                  item: "https://kaupet.no/annonser",
                },
                { "@type": "ListItem", position: 2, name: c.name_nb, item: url },
              ],
            }),
          },
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: title,
              description,
              url,
            }),
          },
        ],
      };
    }
    const l = loaderData?.kind === "listing" ? loaderData.listing : undefined;
    if (!l) {
      return {
        meta: [{ title: "Annonse — Kaupet.no" }, { name: "robots", content: "noindex" }],
      };
    }
    const priceLabel = l.is_free
      ? "Gis bort gratis"
      : l.price_nok != null
        ? `${l.price_nok.toLocaleString("nb-NO")} kr`
        : "Pris ved henvendelse";
    const place = l.city ? ` i ${l.city}` : "";
    const rawTitle = `${l.title} — ${priceLabel}${place} | Kaupet.no`;
    const title = rawTitle.length > 60 ? `${l.title} — ${priceLabel} | Kaupet.no` : rawTitle;
    const baseDesc = (l.description ?? "").replace(/\s+/g, " ").trim();
    const descCore = baseDesc
      ? baseDesc.length > 130
        ? `${baseDesc.slice(0, 127)}…`
        : baseDesc
      : `${l.title}${place}. ${priceLabel} på Kaupet.no.`;
    const description =
      descCore.length < 60 ? `${descCore} ${priceLabel}${place}. Selges på Kaupet.no.` : descCore;
    const url = `https://kaupet.no/${params.kaupetCode}`;
    const isActive = (l.status as string | undefined) === "active";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(!isActive ? [{ name: "robots", content: "noindex" }] : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: l.title,
            description: descCore,
            url,
            offers: {
              "@type": "Offer",
              priceCurrency: "NOK",
              price: l.is_free ? 0 : (l.price_nok ?? undefined),
              availability: isActive
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
              url,
            },
          }),
        },
      ],
    };
  },
  component: RootSlugPage,
  pendingComponent: ListingDetailSkeleton,
  pendingMs: 200,
  pendingMinMs: 300,
  errorComponent: ListingErrorBoundary,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Fant ikke siden</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Annonsen kan ha blitt fjernet eller solgt, eller kategorien finnes ikke.
      </p>
      <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
        <Button className="mt-6" variant="outline">
          Se flere annonser
        </Button>
      </Link>
    </div>
  ),
});

function RootSlugPage() {
  const loaderData = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/$kaupetCode" });
  if (loaderData.kind === "category")
    return (
      <CategoryLandingPage
        category={loaderData.category}
        breadcrumb={[loaderData.category]}
        subSlug={search.sub}
        subSlugParam="sub"
        search={search}
        navigate={navigate}
      />
    );
  return <ListingDetailPage />;
}

function ListingErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Kunne ikke laste annonsen</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button
        className="mt-6"
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Prøv på nytt
      </Button>
    </div>
  );
}

function ListingDetailPage() {
  const { kaupetCode } = Route.useParams();
  const search = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNative = useIsNative();
  const { data: isAdmin } = useIsAdmin();
  const { data: isModerator } = useIsModerator();
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [vehicle360ImgUrls, setVehicle360ImgUrls] = useState<Record<string, string>>({});
  const [statsInfoOpen, setStatsInfoOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const reconcilePromotion = useServerFn(reconcilePromotionPayment);
  const logView = useServerFn(logListingView);
  useEffect(() => {
    if (search.promotion !== "success" || !search.promo_id) return;
    const promoId = search.promo_id;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;

    const finish = () => {
      if (cancelled) return;
      navigate({
        to: "/$kaupetCode",
        params: { kaupetCode },
        search: {},
        replace: true,
      });
    };

    const poll = async () => {
      attempts += 1;
      try {
        const res = await reconcilePromotion({ data: { promotion_id: promoId } });
        if (cancelled) return;
        if (res.status === "active" || res.status === "gifted") {
          showSuccessToast("Fremhevingen er aktivert");
          queryClient.invalidateQueries({ queryKey: ["listing-active-promotion"] });
          queryClient.invalidateQueries({ queryKey: ["featured-listings"] });
          queryClient.invalidateQueries({ queryKey: ["my-listings"] });
          finish();
          return;
        }
        if (res.status === "failed") {
          showErrorToast("Betalingen ble ikke fullført. Fremhevingen er ikke aktivert.");
          finish();
          return;
        }
        if (res.status === "refunded") {
          toast.message("Betalingen er refundert.");
          finish();
          return;
        }
        if (attempts >= maxAttempts) {
          toast.message(
            "Vi venter på bekreftelse fra Vipps. Siden oppdateres så snart betalingen er bekreftet.",
          );
          finish();
          return;
        }
        setTimeout(poll, 1500);
      } catch (e) {
        if (cancelled) return;
        console.error("[promotion reconcile]", e);
        if (attempts >= maxAttempts) {
          showErrorToast("Kunne ikke bekrefte betalingen. Prøv igjen senere.");
          finish();
          return;
        }
        setTimeout(poll, 1500);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.promotion, search.promo_id]);

  const { data, isLoading } = useQuery({
    queryKey: ["listing", kaupetCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, description, price_nok, is_free, condition, can_ship, city, postal_code, display_lat, display_lng, created_at, updated_at, published_at, status, seller_id, organization_id, category_id, attributes, known_issues, no_known_issues, maintenance_history, show_visiting_address, listing_visiting_addresses(address_line, postal_code, city), listing_images(storage_path, sort_order, caption), listing_360_frames(storage_path, frame_order), categories(id, name_nb, slug, parent_id)",
        )
        .eq("kaupet_code", kaupetCode)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Annonsen finnes ikke");

      // organizations has commercial columns (selected_plan, proff_access_until,
      // ...) that must not be publicly readable — organizations_public is a
      // view exposing only the branding columns this page needs. See
      // docs/SIKKERHETSVURDERING.md M-5.
      const organization = data.organization_id
        ? (
            await supabase
              .from("organizations_public")
              .select(
                "id, display_name, organization_number, created_at, website_url, logo_path, brand_palette, has_active_proff",
              )
              .eq("id", data.organization_id)
              .maybeSingle()
          ).data
        : null;
      const visitingAddress = Array.isArray(data.listing_visiting_addresses)
        ? data.listing_visiting_addresses[0]
        : data.listing_visiting_addresses;
      if (organization) {
        return {
          ...data,
          organization,
          seller: {
            kind: "business" as const,
            displayName: organization.display_name,
            organizationNumber: organization.organization_number,
            visitingAddress: visitingAddress
              ? [visitingAddress.address_line, visitingAddress.postal_code, visitingAddress.city]
                  .filter(Boolean)
                  .join(", ")
              : null,
            createdAt: organization.created_at,
          } satisfies SellerIdentity,
        };
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, created_at")
        .eq("id", data.seller_id)
        .maybeSingle();
      // Requires an authenticated session (RPC grant is authenticated-only); for
      // anonymous visitors this errors and we simply fall back to no rating.
      const { data: ratingRows } = await supabase.rpc("user_review_summary", {
        _user_id: data.seller_id,
      });
      const ratingRow = Array.isArray(ratingRows) ? ratingRows[0] : ratingRows;
      return {
        ...data,
        organization: null,
        seller: profile
          ? {
              kind: "private" as const,
              ...profile,
              avg_rating: Number(ratingRow?.avg_rating ?? 0),
              review_count: Number(ratingRow?.review_count ?? 0),
            }
          : null,
      };
    },
  });
  const organization = data?.organization ?? null;
  const hasEffectiveOrganizationProff = organization?.has_active_proff ?? false;
  const {
    data: otherOrganizationListings,
    isLoading: otherListingsLoading,
    isError: otherListingsError,
  } = useQuery({
    queryKey: ["organization-listings", organization?.id, data?.id],
    enabled: hasEffectiveOrganizationProff && !!organization?.id && !!data?.id,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order), attributes, categories(slug)",
        )
        .eq("organization_id", organization!.id)
        .eq("status", "active")
        .neq("id", data!.id)
        .order("created_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (rows ?? []).map((row) =>
        toListingCardData(row as Parameters<typeof toListingCardData>[0]),
      );
    },
  });

  const { data: allCategories } = useCategories();
  const listingId = data?.id;
  const isOwner = !!user && !!data && user.id === data.seller_id;

  const editModeOn = isOwner && !!search.edit;
  const [plateModalOpen, setPlateModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const { data: allFilters } = useAllCategoryFilters();
  const categoriesByIdForBehavior = useMemo(() => {
    const m = new Map<string, { id: string; parent_id: string | null }>();
    for (const c of allCategories ?? []) m.set(c.id, c);
    return m;
  }, [allCategories]);
  const vehicleGroup = data?.category_id
    ? vehicleCategoryGroupFor(data.category_id, allFilters ?? [], categoriesByIdForBehavior)
    : null;
  const genericBrandFilter = data?.category_id
    ? genericBrandFilterFor(data.category_id, allFilters ?? [], categoriesByIdForBehavior)
    : null;
  const behavior = getCategoryBehavior(
    vehicleGroup,
    data?.category_id
      ? isBoatCategory(data.category_id, allFilters ?? [], categoriesByIdForBehavior)
      : false,
  );
  const { saveField, fieldStatus } = useListingEditMutations({
    listingId: listingId ?? "",
    kaupetCode,
    behavior,
  });
  const editContext: ListingEditContextValue | undefined = listingId
    ? {
        editMode: editModeOn,
        listingId,
        behavior,
        saveField,
        fieldStatus,
        openVehicleLookupModal: () => setPlateModalOpen(true),
        openCategoryModal: () => setCategoryModalOpen(true),
      }
    : undefined;

  function toggleEditMode() {
    navigate({
      to: "/$kaupetCode",
      params: { kaupetCode },
      search: (prev) => ({ ...prev, edit: !editModeOn || undefined }),
      replace: true,
    });
  }

  const { data: stats } = useQuery({
    queryKey: ["listing-stats", listingId],
    enabled: isOwner && !!listingId,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("listing_stats", {
        _listing_id: listingId!,
      });
      if (error) throw error;
      const row = Array.isArray(rows) ? rows[0] : rows;
      return {
        total_views: Number(row?.total_views ?? 0),
        favorite_count: Number(row?.favorite_count ?? 0),
      };
    },
  });

  const { data: activePromotion } = useQuery({
    queryKey: ["listing-active-promotion", listingId],
    enabled: isOwner && !!listingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_promotions")
        .select("id, status, expires_at")
        .eq("listing_id", listingId!)
        .in("status", ["active", "pending", "gifted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;
      return data;
    },
  });

  const handleShareOpenChange = useCallback((open: boolean) => {
    setShareOpen(open);
  }, []);

  const contactMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        if (data) savePendingAuthIntent({ type: "contact", listingId: data.id });
        navigate({
          to: "/auth",
          search: { mode: "signin", returnTo: currentReturnTo() },
        });
        return null;
      }
      if (!data) throw new Error("Mangler annonse");
      // Slå opp eksisterende samtale
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", data.id)
        .eq("buyer_id", user.id)
        .maybeSingle();
      if (existing?.id) return existing.id;
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          listing_id: data.id,
          buyer_id: user.id,
          seller_id: data.seller_id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return created.id;
    },
    onSuccess: (conversationId) => {
      if (conversationId) {
        trackProductEvent("contact_started", { listingType: "sell" });
        navigate({ to: "/meldinger/$id", params: { id: conversationId } });
      }
    },
    onError: () => showErrorToast("Kunne ikke åpne samtalen. Prøv igjen."),
  });

  const replayedContact = useRef(false);
  useEffect(() => {
    if (!user || !data || replayedContact.current) return;
    if (!takePendingAuthIntent({ type: "contact", listingId: data.id })) return;
    replayedContact.current = true;
    contactMutation.mutate();
  }, [contactMutation, data, user]);

  useEffect(() => {
    if (!data) return;
    trackProductEvent("listing_opened", { hasImages: (data.listing_images?.length ?? 0) > 0 });
  }, [data]);

  const images = useMemo(
    () => (data?.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [data?.listing_images],
  );

  useEffect(() => {
    if (images.length === 0) return;
    signListingImageUrls(images.map((i) => i.storage_path)).then(setImgUrls);
  }, [images]);

  const vehicle360Frames = useMemo(
    () => (data?.listing_360_frames ?? []).slice().sort((a, b) => a.frame_order - b.frame_order),
    [data?.listing_360_frames],
  );

  useEffect(() => {
    if (vehicle360Frames.length === 0) return;
    signVehicle360FrameUrls(vehicle360Frames.map((f) => f.storage_path)).then(setVehicle360ImgUrls);
  }, [vehicle360Frames]);

  useEffect(() => {
    if (!data?.id || user?.id === data.seller_id) return;
    void logView({ data: { listingId: data.id } }).catch((error: unknown) => {
      console.warn("[listing_views] log failed", error);
    });
  }, [data?.id, data?.seller_id, logView, user?.id]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mt-4 grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
            <div className="mt-8 space-y-3">
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }
  if (!data) return null;
  const seller = data.seller;
  const category = Array.isArray(data.categories) ? data.categories[0] : data.categories;
  const attributes = (data.attributes ?? {}) as Record<string, unknown>;
  const breadcrumb = (() => {
    if (!category || !allCategories) return undefined;
    const categoryChain = breadcrumbPath(category as Category, buildTree(allCategories));
    // The listing's own (leaf) category, not the top-level root — brand/model
    // (and the generic "brand" attribute) are defined as category_filters on
    // the specific category (e.g. "Bil", not "Bil og MC"), so linking to the
    // root would land on a search scope where those filter chips don't exist
    // at all, silently dropping the very checkboxes this breadcrumb exists to
    // offer.
    const rootCategorySlug = categoryChain[categoryChain.length - 1]?.slug ?? null;
    return [
      ...categoryChain.map((c) => ({
        name_nb: c.name_nb,
        slug: c.slug as string | null,
      })),
      ...behavior
        .extraBreadcrumbSegments(attributes, { rootCategorySlug, genericBrandFilter })
        .map((s) => ({
          name_nb: s.name_nb,
          slug: s.slug,
          attrs: s.attrs ? encodeAttrFilters(s.attrs) : undefined,
        })),
    ];
  })();
  const organizationBrand: ListingOrganizationBrand | undefined =
    hasEffectiveOrganizationProff && organization
      ? {
          displayName: organization.display_name,
          logoUrl: organization.logo_path
            ? supabase.storage.from("organization-logos").getPublicUrl(organization.logo_path).data
                .publicUrl
            : null,
          websiteUrl: organization.website_url,
          palette: organization.brand_palette,
        }
      : undefined;
  const relatedListingsSlot =
    hasEffectiveOrganizationProff && !otherListingsError ? (
      otherListingsLoading ? (
        <section className="mt-10" aria-label="Flere annonser fra bedriften">
          <Skeleton className="h-7 w-64" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="aspect-[4/3] rounded-lg" />
            ))}
          </div>
        </section>
      ) : otherOrganizationListings && otherOrganizationListings.length > 0 ? (
        <section className="mt-10" aria-labelledby="organization-listings-heading">
          <h2 id="organization-listings-heading" className="font-display text-xl">
            Flere annonser fra bedriften
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {otherOrganizationListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      ) : undefined
    ) : undefined;

  return (
    <ListingDetailView
      title={data.title}
      subtitle={data.subtitle}
      description={data.description}
      priceNok={data.price_nok}
      isFree={data.is_free}
      condition={data.condition}
      city={data.city}
      postalCode={data.postal_code}
      displayLat={data.display_lat}
      displayLng={data.display_lng}
      createdAt={data.created_at}
      updatedAt={data.updated_at}
      publishedAt={data.published_at}
      knownIssues={data.known_issues}
      noKnownIssues={data.no_known_issues}
      maintenanceHistory={data.maintenance_history}
      category={category ?? null}
      categoryId={data.category_id}
      canShip={data.can_ship}
      requiresDeliveryMethod={behavior.requiresDeliveryMethod}
      organizationBrand={organizationBrand}
      relatedListingsSlot={relatedListingsSlot}
      breadcrumb={breadcrumb}
      enableBackToSearch
      images={images}
      imgUrls={imgUrls}
      vehicle360Frames={vehicle360Frames}
      vehicle360ImgUrls={vehicle360ImgUrls}
      attributes={attributes}
      editMode={isOwner && editContext ? { context: editContext } : undefined}
      actionsMenuSlot={
        user ? (
          <ListingActionsMenu
            listingId={data.id}
            listingTitle={data.title}
            sellerId={data.seller_id}
            isAdminOrModerator={!!(isAdmin || isModerator)}
            isOwner={isOwner}
            listingStatus={data.status}
          />
        ) : undefined
      }
      ownerStatsSlot={
        isOwner ? (
          <>
            <OwnerStatsPanel
              listingId={data.id}
              status={data.status}
              stats={stats}
              activePromotion={activePromotion}
              promoteOpen={promoteOpen}
              onPromoteOpenChange={setPromoteOpen}
              statsInfoOpen={statsInfoOpen}
              onStatsInfoOpenChange={setStatsInfoOpen}
              editMode={editModeOn}
              onToggleEditMode={toggleEditMode}
              hasImages={images.length > 0}
              isFree={data.is_free}
              hasPrice={data.price_nok != null}
            />
            {isNative && vehicleGroup && listingId && (
              <div className="mt-3">
                <Vehicle360CaptureLauncher
                  listingId={listingId}
                  listingTitle={data.title}
                  label="Legg til 360°-opptak"
                />
              </div>
            )}
          </>
        ) : undefined
      }
      sellerContactSlot={
        <SellerContactPanel
          isLoggedIn={!!user}
          seller={seller ?? null}
          isOwner={isOwner}
          listingId={data.id}
          kaupetCode={data.kaupet_code}
          title={data.title}
          onContact={() => contactMutation.mutate()}
          contacting={contactMutation.isPending}
          shareOpen={shareOpen}
          onShareOpenChange={handleShareOpenChange}
          isNative={isNative}
          hasRegistryData={parseVehicleLookup(attributes.vehicle_lookup) != null}
        />
      }
      stickyContactSlot={
        !isOwner ? (
          <Button
            size="native"
            className="flex-1 gap-2 sm:flex-none"
            onClick={() => contactMutation.mutate()}
            disabled={contactMutation.isPending}
          >
            <MessageCircle className="size-4" />
            {contactMutation.isPending
              ? "Åpner…"
              : user
                ? "Send melding"
                : "Logg inn for å sende melding"}
          </Button>
        ) : undefined
      }
    >
      {isOwner && listingId && (
        <>
          <VehiclePlateEditDialog
            open={plateModalOpen}
            onOpenChange={setPlateModalOpen}
            listingId={listingId}
            kaupetCode={kaupetCode}
            currentCategoryId={data.category_id}
            attributes={attributes}
          />
          <CategoryChangeDialog
            open={categoryModalOpen}
            onOpenChange={setCategoryModalOpen}
            listingId={listingId}
            kaupetCode={kaupetCode}
            currentCategoryId={data.category_id}
          />
        </>
      )}
    </ListingDetailView>
  );
}
