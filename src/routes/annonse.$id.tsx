import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, MessageCircle, User as UserIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/favorite-button";

const CONDITION_LABEL: Record<string, string> = {
  new: "Helt ny",
  like_new: "Som ny",
  good: "Pent brukt",
  acceptable: "Brukt med slitasje",
  for_parts: "Til reservedeler",
};

export const Route = createFileRoute("/annonse/$id")({
  component: ListingDetailPage,
  errorComponent: ({ error, reset }) => {
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
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Annonsen finnes ikke</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Den kan ha blitt fjernet eller solgt.
      </p>
      <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
        <Button className="mt-6" variant="outline">
          Se flere annonser
        </Button>
      </Link>
    </div>
  ),
});

function ListingDetailPage() {
  const { id } = Route.useParams();
  const [activeImage, setActiveImage] = useState(0);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, title, description, price_nok, is_free, condition, city, postal_code, created_at, seller_id, category_id, listing_images(storage_path, sort_order), categories(name_nb, slug)",
        )
        .eq("id", id)
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

  const images = (data?.listing_images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  useEffect(() => {
    if (images.length === 0) return;
    signListingImageUrls(images.map((i) => i.storage_path)).then(setImgUrls);
  }, [images.length, data?.id]);

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
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={img.storage_path}
                  type="button"
                  onClick={() => setActiveImage(i)}
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

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm">
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
          </dl>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              {seller?.avatar_url ? (
                <img
                  src={seller.avatar_url}
                  alt=""
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <UserIcon className="size-5 text-muted-foreground" />
                </div>
              )}
              <div className="text-sm">
                <p className="font-medium">{seller?.display_name ?? "Selger"}</p>
                {seller?.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Medlem siden{" "}
                    {new Date(seller.created_at).toLocaleDateString("nb-NO", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
            <Button className="mt-4 w-full gap-2" disabled>
              <MessageCircle className="size-4" /> Send melding (kommer)
            </Button>
            <FavoriteButton listingId={data.id} variant="full" size="lg" className="mt-2" />
          </div>
        </aside>
      </div>

      <section className="mt-10 max-w-2xl">
        <h2 className="font-display text-xl">Beskrivelse</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {data.description}
        </p>
      </section>
    </div>
  );
}
