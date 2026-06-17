import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reconcilePromotionPayment } from "@/lib/promotions.functions";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  MessageCircle,
  User as UserIcon,
  Pencil,
  Eye,
  Users,
  Heart,
  Info,
  ChevronDown,
  Share2,
  Sparkles,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { FavoriteButton } from "@/components/favorite-button";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { ShareListingDialog } from "@/components/share-listing-dialog";

const ListingDetailMap = lazy(() =>
  import("@/components/listing-detail-map").then((m) => ({ default: m.ListingDetailMap })),
);

const CONDITION_LABEL: Record<string, string> = {
  new: "Helt ny",
  like_new: "Som ny",
  good: "Pent brukt",
  acceptable: "Brukt med slitasje",
  for_parts: "Må repareres",
};

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

function ListingDetailPage() {
  const { kaupetCode } = Route.useParams();
  const search = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeImage, setActiveImage] = useState(0);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  const [statsInfoOpen, setStatsInfoOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => setMounted(true), []);

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
          toast.success("Fremhevingen er aktivert");
          queryClient.invalidateQueries({ queryKey: ["listing-active-promotion"] });
          queryClient.invalidateQueries({ queryKey: ["featured-listings"] });
          queryClient.invalidateQueries({ queryKey: ["my-listings"] });
          finish();
          return;
        }
        if (res.status === "failed") {
          toast.error("Betalingen ble ikke fullført. Fremhevingen er ikke aktivert.");
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
          toast.error("Kunne ikke bekrefte betalingen. Prøv igjen senere.");
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
          "id, kaupet_code, title, description, price_nok, is_free, condition, city, postal_code, lat, lng, created_at, updated_at, published_at, status, seller_id, category_id, listing_images(storage_path, sort_order), categories(name_nb, slug)",
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

  const images = (data?.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  useEffect(() => {
    if (images.length === 0) return;
    signListingImageUrls(images.map((i) => i.storage_path)).then(setImgUrls);
  }, [images.length, data?.id]);

  // Logg visning (databasens unike constraint sørger for at samme besøkende
  // kun telles én gang per annonse)
  useEffect(() => {
    if (!data?.id) return;
    if (user && user.id === data.seller_id) return; // ikke tell egne visninger
    let visitorKey = user?.id ?? null;
    if (!visitorKey) {
      try {
        const k = "kaupet_visitor_id";
        visitorKey = localStorage.getItem(k);
        if (!visitorKey) {
          visitorKey = crypto.randomUUID();
          localStorage.setItem(k, visitorKey);
        }
      } catch {
        visitorKey = crypto.randomUUID();
      }
    }
    supabase
      .rpc("log_listing_view", { _listing_id: data.id, _visitor_key: visitorKey })
      .then(({ error }) => {
        if (error) console.warn("[listing_views] log failed", error);
      });
  }, [data?.id, data?.seller_id, user?.id]);

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
      <Link
        to="/annonser"
        search={{ q: "", category: "", sort: "new" }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tilbake til annonser
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
            {images.length > 0 ? (
              <img
                src={imgUrls[images[activeImage].storage_path]}
                alt={data.title}
                className="size-full object-contain"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                Ingen bilder
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto" role="list">
              {images.map((img, i) => (
                <button
                  key={img.storage_path}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`Vis bilde ${i + 1} av ${images.length} for «${data.title}»`}
                  aria-pressed={i === activeImage}
                  className={`size-20 shrink-0 overflow-hidden rounded-lg border-2 ${
                    i === activeImage ? "border-primary" : "border-transparent"
                  }`}
                >
                  {imgUrls[img.storage_path] && (
                    <img
                      src={imgUrls[img.storage_path]}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
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
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Dette er din annonse
              </p>
              <Link to="/mine-annonser/$id/rediger" params={{ id: data.id }} className="mt-3 block">
                <Button className="w-full gap-2" variant="default">
                  <Pencil className="size-4" /> Rediger annonse
                </Button>
              </Link>
              {data.status === "active" &&
                (activePromotion ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 w-full gap-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
                    disabled
                  >
                    <Check className="size-4" /> Annonse fremhevet
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 w-full gap-2"
                    onClick={() => setPromoteOpen(true)}
                  >
                    <Sparkles className="size-4" /> Fremhev annonse
                  </Button>
                ))}
              <PromoteListingDialog
                listingId={data.id}
                open={promoteOpen}
                onOpenChange={setPromoteOpen}
              />
              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-card p-2">
                  <Eye className="mx-auto size-4 text-muted-foreground" />
                  <dd className="mt-1 font-display text-lg leading-none">
                    {stats?.total_views ?? "–"}
                  </dd>
                  <dt className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Visninger
                  </dt>
                </div>
                <div className="rounded-lg bg-card p-2">
                  <Users className="mx-auto size-4 text-muted-foreground" />
                  <dd className="mt-1 font-display text-lg leading-none">
                    {stats?.unique_visitors ?? "–"}
                  </dd>
                  <dt className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Unike besøk
                  </dt>
                </div>
                <div className="rounded-lg bg-card p-2">
                  <Heart className="mx-auto size-4 text-muted-foreground" />
                  <dd className="mt-1 font-display text-lg leading-none">
                    {stats?.favorite_count ?? "–"}
                  </dd>
                  <dt className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Favoritter
                  </dt>
                </div>
              </dl>
              <Collapsible
                open={statsInfoOpen}
                onOpenChange={setStatsInfoOpen}
                className="mt-4 rounded-lg bg-card"
              >
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <Info className="size-3.5 shrink-0 text-primary" />
                      Hva betyr tallene?
                    </span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 transition-transform ${statsInfoOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border px-3 pb-3 pt-2 text-xs text-muted-foreground">
                    <ul className="space-y-2">
                      <li className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-primary">•</span>
                        <span>
                          <strong className="text-foreground">Visninger</strong> — antall ganger
                          annonsen er åpnet (ett oppslag per time).
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-primary">•</span>
                        <span>
                          <strong className="text-foreground">Unike besøk</strong> — antall
                          distinkte besøkende. Vi skiller brukere ved innlogget bruker-ID eller en
                          tilfeldig nøkkel i nettleseren. Samme person telles bare én gang.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-primary">•</span>
                        <span>
                          <strong className="text-foreground">Favoritter</strong> — antall brukere
                          som har lagt annonsen i favoritter.
                        </span>
                      </li>
                    </ul>
                    <p className="mt-3 rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
                      Tallene kan være noe unøyaktige fordi vi ikke sporer brukere på tvers av
                      nettlesere eller økter. Bytter noen nettleser eller rydder data, telles de på
                      nytt.
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              {user && seller?.avatar_url ? (
                <img src={seller.avatar_url} alt="" className="size-10 rounded-full object-cover" />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <UserIcon className="size-5 text-muted-foreground" />
                </div>
              )}
              <div className="text-sm">
                {user ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium">{seller?.display_name ?? "Selger"}</p>
                    </div>
                    {seller?.created_at && (
                      <p className="text-xs text-muted-foreground">
                        Medlem siden{" "}
                        {new Date(seller.created_at).toLocaleDateString("nb-NO", {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Logg inn for å se informasjon om selger</p>
                )}
              </div>
            </div>

            {!isOwner && (
              <Button
                className="mt-4 w-full gap-2"
                onClick={() => contactMutation.mutate()}
                disabled={contactMutation.isPending}
              >
                <MessageCircle className="size-4" />
                {contactMutation.isPending ? "Åpner samtale…" : "Send melding til selger"}
              </Button>
            )}
            <FavoriteButton listingId={data.id} variant="full" size="lg" className="mt-2" />
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full gap-2"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="size-4" /> Del annonse
            </Button>
            <ShareListingDialog
              open={shareOpen}
              onOpenChange={setShareOpen}
              kaupetCode={data.kaupet_code}
              title={data.title}
            />
          </div>
        </aside>
      </div>

      {data.lat != null && data.lng != null && (
        <section className="mt-10">
          <div className="h-80 overflow-hidden rounded-2xl border border-border">
            {mounted ? (
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <ListingDetailMap lat={data.lat} lng={data.lng} />
              </Suspense>
            ) : (
              <div className="h-full w-full animate-pulse bg-muted" />
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Lokasjonen er omtrentlig. Gjenstanden befinner seg ikke nødvendigvis innenfor det
            markerte området.
          </p>
        </section>
      )}
    </div>
  );
}
