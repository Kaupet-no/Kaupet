import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reconcilePromotionPayment } from "@/lib/promotions.functions";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { z } from "zod";
import { useIsNative } from "@/hooks/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsModerator } from "@/hooks/use-is-moderator";
import { ListingActionsMenu } from "@/components/listing-detail/listing-actions-menu";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { readLastSearchContext, type LastSearchContext } from "@/lib/last-search-context";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getCategoryIcon } from "@/lib/category-icons";
import { buildTree, descendants, type Category } from "@/lib/categories";
import { normalizeSlugForMatch } from "@/lib/slug";
import {
  applyAttributeFilters,
  effectiveFiltersForCategory,
  normalizeFilter,
  splitPrimaryFilters,
  type AttributeFilterValue,
} from "@/lib/category-filters";

import { signListingImageUrls } from "@/lib/storage";
import { CONDITION_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import { OwnerStatsPanel } from "@/components/listing-detail/owner-stats-panel";
import { SellerContactPanel } from "@/components/listing-detail/seller-contact-panel";
import { VehicleSpecBar } from "@/components/listing-detail/vehicle/vehicle-spec-bar";
import { VehicleTechTable } from "@/components/listing-detail/vehicle/vehicle-tech-table";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { VEHICLE_LEAF_SLUGS, type VehicleLeafSlug } from "@/lib/vehicle-classification";
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

// crypto.randomUUID() requires a secure context and isn't available in every
// WebView — fall back to a non-crypto random ID so anonymous view-count
// tracking still works there.
function randomVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const Route = createFileRoute("/$kaupetCode")({
  validateSearch: z.object({
    promotion: z.string().optional(),
    promo_id: z.string().optional(),
    // Only used by the category-landing branch, to deep-link preselected
    // filter values (e.g. from the homepage's category picker).
    f: z.record(z.string(), z.any()).optional(),
    priceMin: z.coerce.number().int().min(0).optional(),
    priceMax: z.coerce.number().int().min(0).optional(),
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
      return { meta: [{ title: `/${c.name_nb} — Kaupet.no` }] };
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
  if (loaderData.kind === "category") return <CategoryLandingPage main={loaderData.category} />;
  return <ListingDetailPage />;
}

function CategoryLandingPage({ main }: { main: Category }) {
  const {
    f: initialFilters,
    priceMin: initialPriceMin,
    priceMax: initialPriceMax,
  } = Route.useSearch() as {
    f?: Record<string, AttributeFilterValue>;
    priceMin?: number;
    priceMax?: number;
  };
  const [filterValues, setFilterValues] = useState<Record<string, AttributeFilterValue>>(
    () => initialFilters ?? {},
  );
  const [priceMin, setPriceMin] = useState<number | undefined>(initialPriceMin);
  const [priceMax, setPriceMax] = useState<number | undefined>(initialPriceMax);

  const { data: categories } = useQuery({
    queryKey: ["categories", "with-color"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: allFilters } = useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order, is_primary")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  const tree = useMemo(() => buildTree(categories ?? []), [categories]);
  const categoryIds = useMemo(
    () => [main.id, ...descendants(main, tree).map((c) => c.id)],
    [main, tree],
  );
  const filters = useMemo(
    () => effectiveFiltersForCategory(main.id, allFilters ?? [], tree.byId),
    [main, allFilters, tree],
  );
  const { primary: primaryFilters, secondary: secondaryFilters } = useMemo(
    () => splitPrimaryFilters(filters),
    [filters],
  );
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const { data: listings, isLoading } = useQuery({
    queryKey: ["category-listings", main.id, filterValues, priceMin, priceMax],
    queryFn: async () => {
      let qb = supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active")
        .in("category_id", categoryIds);
      qb = applyAttributeFilters(qb, filterValues);
      if (typeof priceMin === "number") qb = qb.gte("price_nok", priceMin);
      if (typeof priceMax === "number") qb = qb.lte("price_nok", priceMax);
      const { data, error } = await qb.order("created_at", { ascending: false }).limit(48);
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          subtitle: l.subtitle,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
  });

  const Icon = getCategoryIcon(main.icon ?? null);
  const accent = main.color ?? undefined;

  return (
    <div>
      <section
        className="relative overflow-hidden"
        style={accent ? { background: accent } : undefined}
      >
        <div className="absolute inset-0 bg-background/80" aria-hidden />
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-center gap-3">
            <span
              className="flex size-12 items-center justify-center rounded-full text-white"
              style={{ background: accent ?? "var(--primary)" }}
            >
              <Icon className="size-6" />
            </span>
            <h1 className="font-display text-4xl tracking-tight">/{main.name_nb}</h1>
          </div>
          <Link
            to="/annonser"
            search={{ q: "", category: main.slug, sort: "new" }}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Search className="size-4" /> Søk i alle kategorier
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-6xl gap-8 px-4 py-8 md:grid md:grid-cols-[16rem_1fr]">
        <aside className="mb-6 space-y-5 md:mb-0">
          <p className="text-sm font-medium">Filtrer</p>
          <div className="space-y-2">
            <Label>Pris (kr)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Fra"
                value={priceMin ?? ""}
                onChange={(e) =>
                  setPriceMin(e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
              <Input
                type="number"
                placeholder="Til"
                value={priceMax ?? ""}
                onChange={(e) =>
                  setPriceMax(e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
            </div>
          </div>
          {filters.length > 0 && (
            <>
              <CategoryFilterFields
                filters={primaryFilters}
                values={filterValues}
                onChange={(key, v) =>
                  setFilterValues((prev) => {
                    const next = { ...prev };
                    if (v === undefined) delete next[key];
                    else next[key] = v;
                    return next;
                  })
                }
              />
              {secondaryFilters.length > 0 && (
                <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-0 text-primary hover:bg-transparent"
                    >
                      {moreFiltersOpen ? "Vis færre valg" : "Se flere valg"}
                      <ChevronDown
                        className={`size-4 transition-transform ${moreFiltersOpen ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out">
                    <CategoryFilterFields
                      filters={secondaryFilters}
                      values={filterValues}
                      onChange={(key, v) =>
                        setFilterValues((prev) => {
                          const next = { ...prev };
                          if (v === undefined) delete next[key];
                          else next[key] = v;
                          return next;
                        })
                      }
                    />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
          {(Object.keys(filterValues).length > 0 ||
            priceMin !== undefined ||
            priceMax !== undefined) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterValues({});
                setPriceMin(undefined);
                setPriceMax(undefined);
              }}
            >
              Nullstill filtre
            </Button>
          )}
        </aside>

        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (listings ?? []).length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">
              Ingen annonser i denne kategorien ennå.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(listings ?? []).map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

type BackTarget =
  | { mode: "history"; label: string }
  | { mode: "search"; label: string; search: LastSearchContext["search"] }
  | { mode: "default" };

function ListingDetailPage() {
  const { kaupetCode } = Route.useParams();
  const search = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNative = useIsNative();
  const { data: isAdmin } = useIsAdmin();
  const { data: isModerator } = useIsModerator();
  const [activeImage, setActiveImage] = useState(0);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  const [statsInfoOpen, setStatsInfoOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [backTarget, setBackTarget] = useState<BackTarget>({ mode: "default" });
  const fromSearch = useRouterState({
    select: (s) => (s.location.state as { fromSearch?: boolean } | null)?.fromSearch === true,
  });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const closeMapOverlay = useCallback(() => setMapOverlayOpen(false), []);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const last = readLastSearchContext();
    if (router.history.canGoBack() && last && fromSearch) {
      setBackTarget({ mode: "history", label: last.label });
    } else if (last) {
      setBackTarget({ mode: "search", label: last.label, search: last.search });
    } else {
      setBackTarget({ mode: "default" });
    }
  }, [router, fromSearch]);

  const reconcilePromotion = useServerFn(reconcilePromotionPayment);
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
          "id, kaupet_code, title, subtitle, description, price_nok, is_free, condition, city, postal_code, display_lat, display_lng, created_at, updated_at, published_at, status, seller_id, category_id, attributes, listing_images(storage_path, sort_order), categories(name_nb, slug)",
        )
        .eq("kaupet_code", kaupetCode)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Annonsen finnes ikke");
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, created_at")
        .eq("id", data.seller_id)
        .maybeSingle();
      return { ...data, seller: profile };
    },
  });

  const listingId = data?.id;
  const isOwner = !!user && !!data && user.id === data.seller_id;

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
        unique_visitors: Number(row?.unique_visitors ?? 0),
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
        navigate({
          to: "/auth",
          search: { mode: "signin" },
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
        navigate({ to: "/meldinger/$id", params: { id: conversationId } });
      }
    },
  });

  const images = useMemo(
    () => (data?.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [data?.listing_images],
  );

  useEffect(() => {
    if (images.length === 0) return;
    signListingImageUrls(images.map((i) => i.storage_path)).then(setImgUrls);
  }, [images]);

  // Logg visning (databasens unike constraint sørger for at samme besøkende
  // kun telles én gang per annonse)
  useEffect(() => {
    if (!data?.id) return;
    if (user && user.id === data.seller_id) return; // ikke tell egne visninger
    // crypto.randomUUID() kun tilgjengelig i secure context — utilgjengelig i
    // enkelte WebView-oppsett (eldre Android System WebView, evt. usikker
    // origin). View-telling er ren analytics og skal aldri kunne krasje
    // annonsesiden, så hele blokken er try/catch-et med en ikke-crypto-basert
    // fallback for visitor-ID.
    try {
      let visitorKey = user?.id ?? null;
      if (!visitorKey) {
        const k = "kaupet_visitor_id";
        try {
          visitorKey = localStorage.getItem(k);
        } catch {
          visitorKey = null;
        }
        if (!visitorKey) {
          visitorKey = randomVisitorId();
          try {
            localStorage.setItem(k, visitorKey);
          } catch {
            /* ignore — privat nettlesing e.l. */
          }
        }
      }
      supabase
        .rpc("log_listing_view", { _listing_id: data.id, _visitor_key: visitorKey })
        .then(({ error }) => {
          if (error) console.warn("[listing_views] log failed", error);
        });
    } catch (e) {
      console.warn("[listing_views] log failed", e);
    }
  }, [data?.id, data?.seller_id, user]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (!data) return null;

  const priceLabel = data.is_free
    ? "Gis bort"
    : data.price_nok != null
      ? `${data.price_nok.toLocaleString("nb-NO")} kr`
      : "Pris ved henvendelse";

  const seller = data.seller;
  const category = Array.isArray(data.categories) ? data.categories[0] : data.categories;

  const attributes = (data.attributes ?? {}) as Record<string, unknown>;
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <NativePageHeader title={data.title} />
      {!isNative &&
        (backTarget.mode === "history" ? (
          <button
            type="button"
            onClick={() => router.history.back()}
            className="inline-flex items-center gap-1 py-2 pr-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Tilbake til {backTarget.label}
          </button>
        ) : backTarget.mode === "search" ? (
          <Link
            to="/annonser"
            search={backTarget.search as never}
            className="inline-flex items-center gap-1 py-2 pr-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Tilbake til {backTarget.label}
          </Link>
        ) : (
          <Link
            to="/annonser"
            search={{ q: "", category: "", sort: "new" }}
            className="inline-flex items-center gap-1 py-2 pr-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Tilbake til annonser
          </Link>
        ))}

      <div className="mt-4 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative mb-6">
            <ImageGallery
              images={images}
              imgUrls={imgUrls}
              activeImage={activeImage}
              onSelect={setActiveImage}
              title={data.title}
              onImageClick={images.length > 0 ? setLightboxIndex : undefined}
            />
            {images.length > 0 && (
              <div className="absolute -bottom-4 left-4 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
                <p className="font-display text-xl leading-none text-primary">{priceLabel}</p>
              </div>
            )}
          </div>
          {isVehicleCategory && (
            <VehicleTechTable vehicleLookup={vehicleLookup} mileageKm={mileageKm} />
          )}
          <section className="mt-8">
            <h2 className="font-display text-xl">Beskrivelse</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {data.description}
            </p>
          </section>
        </div>

        <aside className="space-y-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {category && (
                  <Link
                    to="/annonser"
                    search={{ q: "", category: category.slug, sort: "new" }}
                    className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    {category.name_nb}
                  </Link>
                )}
                <h1 className="mt-1 font-display text-3xl leading-tight tracking-tight">
                  {data.title}
                </h1>
                {data.subtitle && (
                  <p className="mt-1 text-sm text-muted-foreground">{data.subtitle}</p>
                )}
                {/* Prisen vises flytende over bildekanten når det finnes bilder
                    (se galleriseksjonen) — her kun som fallback uten bilder. */}
                {images.length === 0 && (
                  <p className="mt-3 font-display text-3xl text-primary">{priceLabel}</p>
                )}
              </div>
              {user && !isOwner && (
                <div className="shrink-0 pt-0.5">
                  <ListingActionsMenu
                    listingId={data.id}
                    listingTitle={data.title}
                    isAdminOrModerator={!!(isAdmin || isModerator)}
                  />
                </div>
              )}
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
            const publishedRaw = (data as { published_at: string | null }).published_at;
            const updatedRaw = (data as { updated_at: string | null }).updated_at;
            const publishedDate = publishedRaw ? new Date(publishedRaw) : new Date(data.created_at);
            const updatedDate = updatedRaw ? new Date(updatedRaw) : null;

            const isEditedLater =
              updatedDate != null &&
              (updatedDate.getFullYear() > publishedDate.getFullYear() ||
                updatedDate.getMonth() > publishedDate.getMonth() ||
                updatedDate.getDate() > publishedDate.getDate());

            const label = isEditedLater ? "Sist redigert" : "Publisert";
            const dateStr =
              isEditedLater && updatedRaw ? fmt(updatedRaw) : fmt(publishedRaw ?? data.created_at);

            return (
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
                {data.condition && (
                  <div>
                    <dt className="text-muted-foreground">Tilstand</dt>
                    <dd className="font-medium">
                      {CONDITION_LABEL[data.condition] ?? data.condition}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Lokasjon</dt>
                  <dd className="flex items-center gap-1 font-medium">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {data.city || data.postal_code || "Ikke oppgitt"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{dateStr}</dd>
                </div>
              </dl>
            );
          })()}

          {isOwner && (
            <OwnerStatsPanel
              listingId={data.id}
              status={data.status}
              stats={stats}
              activePromotion={activePromotion}
              promoteOpen={promoteOpen}
              onPromoteOpenChange={setPromoteOpen}
              statsInfoOpen={statsInfoOpen}
              onStatsInfoOpenChange={setStatsInfoOpen}
            />
          )}

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
          />
        </aside>
      </div>

      {data.display_lat != null && data.display_lng != null && (
        <section className="mt-10">
          <button
            type="button"
            onClick={() => setMapOverlayOpen(true)}
            aria-label="Se kart i fullskjerm"
            className="block h-80 w-full cursor-pointer overflow-hidden rounded-2xl border border-border"
          >
            {mounted ? (
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <ListingDetailMap
                  lat={data.display_lat}
                  lng={data.display_lng}
                  interactive={false}
                />
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
        <Suspense>
          <ImageLightbox
            images={images}
            imgUrls={imgUrls}
            initialIndex={lightboxIndex}
            title={data.title}
            onClose={closeLightbox}
          />
        </Suspense>
      )}

      {mapOverlayOpen && data.display_lat != null && data.display_lng != null && (
        <Suspense>
          <MapOverlay lat={data.display_lat} lng={data.display_lng} onClose={closeMapOverlay} />
        </Suspense>
      )}
    </div>
  );
}
