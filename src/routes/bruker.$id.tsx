import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, User as UserIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "@/components/star-rating";

import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { AdminUserActions } from "@/components/admin/suspend-user-menu";
import { getPublicProfile, listUserReviews } from "@/lib/reviews.functions";

export const Route = createFileRoute("/bruker/$id")({
  loader: async ({ params }) => {
    const profile = await getPublicProfile({ data: { userId: params.id } });
    if (!profile) throw notFound();
    return { profile };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.profile?.display_name ?? "Bruker";
    const title = `${name} — Kaupet.no`;
    const desc = loaderData?.profile
      ? `${name} har ${loaderData.profile.review_count} vurdering${loaderData.profile.review_count === 1 ? "" : "er"} på Kaupet.no.`
      : "Brukerprofil på Kaupet.no.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: PublicProfilePage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Kunne ikke laste brukerprofilen</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Brukeren finnes ikke</h1>
      <Link to="/">
        <Button className="mt-6" variant="outline">Til forsiden</Button>
      </Link>
    </div>
  ),
});

function PublicProfilePage() {
  const { id } = Route.useParams();
  const { profile } = Route.useLoaderData();
  const listReviewsFn = useServerFn(listUserReviews);

  const { data: reviews } = useQuery({
    queryKey: ["public-reviews", id],
    queryFn: () => listReviewsFn({ data: { userId: id, limit: 50 } }),
  });

  const { data: activeListings } = useQuery({
    queryKey: ["public-listings", id],
    queryFn: async (): Promise<ListingCardData[]> => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, title, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("seller_id", id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((l: any) => {
        const imgs = (l.listing_images ?? [])
          .slice()
          .sort((a: any, b: any) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          title: l.title,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
  });

  const memberSince = new Date(profile.created_at).toLocaleDateString("nb-NO", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <Avatar className="size-24">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.display_name} />}
          <AvatarFallback className="bg-primary/10 text-2xl font-medium text-primary">
            {profile.display_name?.slice(0, 2).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight">{profile.display_name}</h1>
          </div>
          {profile.location && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4" /> {profile.location}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Medlem siden {memberSince}</p>
          <div className="mt-3 flex items-center gap-2">
            {profile.review_count > 0 ? (
              <>
                <StarRating value={profile.avg_rating} readOnly />
                <span className="text-sm font-medium">{profile.avg_rating.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">
                  ({profile.review_count} vurdering{profile.review_count === 1 ? "" : "er"})
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Ingen vurderinger ennå</span>
            )}
          </div>
        </div>
        <AdminUserActions userId={id} displayName={profile.display_name ?? "brukeren"} />
      </div>

      {profile.bio && (
        <p className="mt-6 whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          {profile.bio}
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl tracking-tight">Vurderinger</h2>
        <div className="mt-4 space-y-3">
          {!reviews ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
              Ingen vurderinger å vise enda.
            </p>
          ) : (
            reviews.map((r) => (
              <article key={r.id} className="rounded-xl border border-border bg-card p-4">
                <header className="flex items-center gap-3">
                  {r.reviewer?.avatar_url ? (
                    <img
                      src={r.reviewer.avatar_url}
                      alt=""
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                      <UserIcon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.reviewer?.id ? (
                        <Link to="/bruker/$id" params={{ id: r.reviewer.id }} className="hover:underline">
                          {r.reviewer.display_name ?? "Ukjent bruker"}
                        </Link>
                      ) : (
                        "Ukjent bruker"
                      )}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        som {r.role === "buyer" ? "kjøper" : "selger"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("nb-NO", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      {r.listing && (
                        <>
                          {" · "}
                          <Link to="/annonse/$id" params={{ id: r.listing.id }} className="hover:underline">
                            {r.listing.title}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <StarRating value={r.rating} readOnly size={16} />
                </header>
                {r.comment && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{r.comment}</p>
                )}
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl tracking-tight">Aktive annonser</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {!activeListings ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
            ))
          ) : activeListings.length === 0 ? (
            <p className="col-span-full rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
              Brukeren har ingen aktive annonser.
            </p>
          ) : (
            activeListings.map((l) => <ListingCard key={l.id} listing={l} />)
          )}
        </div>
      </section>
    </div>
  );
}
