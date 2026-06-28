import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reconcilePromotionPayment } from "@/lib/promotions.functions";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { toast } from "sonner";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { z } from "zod";
import { useIsNative } from "@/lib/use-is-native";
import { NativePageHeader } from "@/components/native-page-header";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useIsModerator } from "@/lib/use-is-moderator";
import { ListingActionsMenu } from "@/components/listing-detail/listing-actions-menu";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { readLastSearchContext, type LastSearchContext } from "@/lib/last-search-context";

import { signListingImageUrls } from "@/lib/storage";
import { CONDITION_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ImageGallery } from "@/components/listing-detail/image-gallery";
import { OwnerStatsPanel } from "@/components/listing-detail/owner-stats-panel";
import { SellerContactPanel } from "@/components/listing-detail/seller-contact-panel";

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
  }),
  loader: async ({ params }) => {
    if (!/^[0-9]{8}$/.test(params.kaupetCode)) throw notFound();
    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, kaupet_code, title, description, price_nok, is_free, condition, city, updated_at, published_at, status",
      )
      .eq("kaupet_code", params.kaupetCode)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { listing: data };
  },
  head: ({ params, loaderData }) => {
    const l = loaderData?.listing;
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
  component: ListingDetailPage,
  errorComponent: ListingErrorBoundary,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Annonsen finnes ikke</h1>
      <p className="mt-2 text-sm text-muted-foreground">Den kan ha blitt fjernet eller solgt.</p>
      <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
        <Button className="mt-6" variant="outline">
          Se flere annonser
        </Button>
      </Link>
    </div>
  ),
});

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const closeMapOverlay = useCallback(() => setMapOverlayOpen(false), []);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const last = readLastSearchContext();
    if (router.history.canGoBack() && last) {
      setBackTarget({ mode: "history", label: last.label });
    } else if (last) {
      setBackTarget({ mode: "search", label: last.label, search: last.search });
    } else {
      setBackTarget({ mode: "default" });
    }
  }, [router]);

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
          "id, kaupet_code, title, description, price_nok, is_free, condition, city, postal_code, display_lat, display_lng, created_at, updated_at, published_at, status, seller_id, category_id, listing_images(storage_path, sort_order), categories(name_nb, slug)",
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
      <div className="mx-auto max-w-5xl px-4 py-10">
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
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
          <ImageGallery
            images={images}
            imgUrls={imgUrls}
            activeImage={activeImage}
            onSelect={setActiveImage}
            title={data.title}
            onImageClick={images.length > 0 ? setLightboxIndex : undefined}
          />
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
                <p className="mt-3 font-display text-3xl text-primary">{priceLabel}</p>
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
                <div>
                  <dt className="text-muted-foreground">Tilstand</dt>
                  <dd className="font-medium">
                    {CONDITION_LABEL[data.condition] ?? data.condition}
                  </dd>
                </div>
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
