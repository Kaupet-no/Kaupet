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
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { z } from "zod";
import { useIsNative } from "@/hooks/use-is-native";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsModerator } from "@/hooks/use-is-moderator";
import { ListingActionsMenu } from "@/components/listing-detail/listing-actions-menu";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { readLastSearchContext, type LastSearchContext } from "@/lib/last-search-context";
import { CategoryLandingPage } from "@/components/category-landing-page";
import { type Category } from "@/lib/categories";
import { normalizeSlugForMatch } from "@/lib/slug";

import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { OwnerStatsPanel } from "@/components/listing-detail/owner-stats-panel";
import { SellerContactPanel } from "@/components/listing-detail/seller-contact-panel";
import { ListingDetailView } from "@/components/listing-detail/listing-detail-view";

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
    // Slug of a descendant category to scope the page to, without leaving
    // this URL — e.g. Interiør > Møbler > Sofa still lands on /interiør.
    sub: z.string().optional(),
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
  const { f, priceMin, priceMax, sub } = Route.useSearch();
  if (loaderData.kind === "category")
    return (
      <CategoryLandingPage
        category={loaderData.category}
        breadcrumb={[loaderData.category]}
        subSlug={sub}
        subSlugParam="sub"
        initialFilters={f}
        initialPriceMin={priceMin}
        initialPriceMax={priceMax}
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

type BackTarget =
  | { mode: "history"; label: string }
  | { mode: "search"; label: string; search: LastSearchContext["search"] }
  | { mode: "default" };

const backLinkClass =
  "inline-flex items-center gap-1 py-2 pr-2 text-sm text-muted-foreground hover:text-foreground";

function BackNavLink({ target, onHistoryBack }: { target: BackTarget; onHistoryBack: () => void }) {
  if (target.mode === "history") {
    return (
      <button type="button" onClick={onHistoryBack} className={backLinkClass}>
        <ArrowLeft className="size-4" /> Tilbake til {target.label}
      </button>
    );
  }
  if (target.mode === "search") {
    return (
      <Link to="/annonser" search={target.search as never} className={backLinkClass}>
        <ArrowLeft className="size-4" /> Tilbake til {target.label}
      </Link>
    );
  }
  return (
    <Link to="/annonser" search={{ q: "", category: "", sort: "new" }} className={backLinkClass}>
      <ArrowLeft className="size-4" /> Tilbake til annonser
    </Link>
  );
}

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
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [statsInfoOpen, setStatsInfoOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [backTarget, setBackTarget] = useState<BackTarget>({ mode: "default" });
  const fromSearch = useRouterState({
    select: (s) => (s.location.state as { fromSearch?: boolean } | null)?.fromSearch === true,
  });

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
          "id, kaupet_code, title, subtitle, description, price_nok, is_free, condition, city, postal_code, display_lat, display_lng, created_at, updated_at, published_at, status, seller_id, category_id, attributes, known_issues, no_known_issues, maintenance_history, listing_images(storage_path, sort_order), categories(name_nb, slug)",
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
      images={images}
      imgUrls={imgUrls}
      attributes={attributes}
      backSlot={<BackNavLink target={backTarget} onHistoryBack={() => router.history.back()} />}
      actionsMenuSlot={
        user && !isOwner ? (
          <ListingActionsMenu
            listingId={data.id}
            listingTitle={data.title}
            isAdminOrModerator={!!(isAdmin || isModerator)}
          />
        ) : undefined
      }
      ownerStatsSlot={
        isOwner ? (
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
        />
      }
    />
  );
}
