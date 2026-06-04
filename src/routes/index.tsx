import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Heart, MapPin, Search, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useRef, useState } from "react";
import Autoplay from "embla-carousel-autoplay";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ListingCard, type ListingCardData } from "@/components/listing-card";

const searchSchema = z.object({
  q: z.string().optional().default(""),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Kaupet.no — Kjøp og salg av brukte ting" },
      {
        name: "description",
        content:
          "Norges åpne markedsplass for brukte ting. Finn møbler, elektronikk, klær og mer fra naboer over hele landet.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [qDraft, setQDraft] = useState("");
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: true }));

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, slug, name_nb").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: popular } = useQuery({
    queryKey: ["popular-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, price_nok, is_free, city, created_at, view_count, listing_images(storage_path, sort_order)")
        .eq("status", "active")
        .order("view_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
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

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      to: "/annonser",
      search: { q: qDraft.trim(), category: "", sort: "new" },
    });
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.05fr_1fr] md:py-24">
          <div className="space-y-6">
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Gi tingene dine <span className="italic text-accent">et nytt liv</span>.
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd, ingen reklame.
            </p>

            <form onSubmit={submitSearch} className="flex max-w-lg gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                  placeholder="Hva leter du etter? F.eks. sykkel, sofa, iPhone…"
                  className="h-12 pl-9 text-base"
                  aria-label="Søk i annonser"
                />
              </div>
              <Button type="submit" size="lg" className="gap-2">
                Søk <ArrowRight className="size-4" />
              </Button>
            </form>

            <div className="flex flex-wrap gap-3">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button size="lg" variant="outline">
                  Kom i gang gratis
                </Button>
              </Link>
            </div>
          </div>

          {/* Popular listings carousel */}
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-accent/10 blur-2xl" />
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="font-display text-sm tracking-tight text-muted-foreground">Populært akkurat nå</h2>
                <Link
                  to="/annonser"
                  search={{ q: "", category: "", sort: "new" }}
                  className="text-xs text-primary hover:underline"
                >
                  Se alle →
                </Link>
              </div>

              {popular && popular.length > 0 ? (
                <Carousel opts={{ align: "start", loop: true }} plugins={[autoplay.current]} className="w-full">
                  <CarouselContent>
                    {popular.map((listing) => (
                      <CarouselItem key={listing.id} className="basis-full sm:basis-1/2">
                        <ListingCard listing={listing} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="-left-3" />
                  <CarouselNext className="-right-3" />
                </Carousel>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Utforsk kategorier</h2>
            <p className="mt-1 text-muted-foreground">Bla gjennom det folk i nærheten selger akkurat nå.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(categories ?? []).map((cat) => (
            <Link
              key={cat.id}
              to="/annonser"
              search={{ q: "", category: cat.slug, sort: "new" }}
              className="group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-5 text-left transition hover:border-primary hover:shadow-sm"
            >
              <span className="font-medium">{cat.name_nb}</span>
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
          {!categories && <div className="col-span-full text-sm text-muted-foreground">Laster kategorier…</div>}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-3xl tracking-tight">Slik fungerer det</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Heart,
                title: "Finn noe du liker",
                body: "Søk etter brukte skatter fra hele Norge — eller bare nabolaget ditt.",
              },
              {
                icon: MapPin,
                title: "Møt selgeren",
                body: "Send en melding, avtal henting lokalt eller post i posten.",
              },
              {
                icon: ShieldCheck,
                title: "Trygt og åpent",
                body: "Kaupet.no utvikles som åpen kildekode. Du kan se nøyaktig hvordan dataene dine håndteres.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="size-5" />
                </div>
                <h3 className="font-display text-xl">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open source CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="overflow-hidden rounded-3xl border border-border bg-primary px-8 py-12 text-primary-foreground md:px-16 md:py-16">
          <div className="grid items-center gap-8 md:grid-cols-[1.5fr_1fr]">
            <div>
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">Et alternativ vi bygger sammen.</h2>
              <p className="mt-3 max-w-xl opacity-90">
                Kaupet.no bygges åpent på GitHub. Frivillige utviklere og designere er hjertelig velkomne.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <a href="https://github.com/Kaupet-no/kaupet" target="_blank" rel="noreferrer">
                <Button size="lg" variant="secondary">
                  Bidra på GitHub
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
