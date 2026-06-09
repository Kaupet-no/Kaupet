import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Baby,
  Car,
  Dumbbell,
  Gamepad2,
  Heart,
  Home,
  type LucideIcon,
  MapPin,
  Package,
  Palette,
  Search,
  ShieldCheck,
  Shirt,
  Ship,
  Smartphone,
  Sofa,
  Wrench,
} from "lucide-react";
import { z } from "zod";
import { useMemo, useRef, useState } from "react";
import Autoplay from "embla-carousel-autoplay";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { ChevronLeft } from "lucide-react";
import { useIsNative } from "@/lib/use-is-native";
import { AppLanding } from "@/components/app-landing";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "mobler-og-interior": Sofa,
  elektronikk: Smartphone,
  "klar-og-mote": Shirt,
  "barn-og-baby": Baby,
  "sport-og-friluft": Dumbbell,
  "hus-og-hage": Home,
  "verktoy-og-byggvarer": Wrench,
  "hobby-fritid-og-underholdning": Gamepad2,
  "antikviteter-og-kunst": Palette,
  "deler-bil-og-mc": Car,
  "deler-til-bat": Ship,
  annet: Package,
};

type CategoryRow = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
};

const searchSchema = z.object({
  q: z.string().optional().default(""),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Kaupet.no — Gi tingene dine et nytt liv" },
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
  const native = useIsNative();
  if (native) return <AppLanding />;
  return <WebLanding />;
}

function WebLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [qDraft, setQDraft] = useState("");
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: true }));

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const rootCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parent_id === null),
    [categories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();
    for (const c of categories ?? []) {
      if (!c.parent_id) continue;
      const arr = map.get(c.parent_id) ?? [];
      arr.push(c);
      map.set(c.parent_id, arr);
    }
    return map;
  }, [categories]);

  const [activeCategory, setActiveCategory] = useState<CategoryRow | null>(null);

  const handlePickCategory = (cat: CategoryRow) => {
    const subs = childrenByParent.get(cat.id) ?? [];
    if (subs.length === 0) {
      navigate({
        to: "/annonser",
        search: { q: "", category: cat.slug, sort: "new" },
      });
      return;
    }
    setActiveCategory(cat);
  };

  const { data: popular } = useQuery({
    queryKey: ["popular-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, title, price_nok, is_free, city, created_at, view_count, listing_images(storage_path, sort_order)",
        )
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

  const PopularCarousel = () => (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-accent/10 blur-2xl" />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="font-display text-sm tracking-tight text-muted-foreground">
            Populært akkurat nå
          </h2>
          <Link
            to="/annonser"
            search={{ q: "", category: "", sort: "new" }}
            className="text-xs text-primary hover:underline"
          >
            Se alle →
          </Link>
        </div>

        {popular && popular.length > 0 ? (
          <Carousel
            opts={{ align: "start", loop: true }}
            plugins={[autoplay.current]}
            className="w-full"
          >
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
  );

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
              Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen
              mellomledd, ingen reklame.
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
              {user ? (
                <Link to="/ny-annonse">
                  <Button size="lg" variant="outline">
                    Opprett en annonse
                  </Button>
                </Link>
              ) : (
                <Link to="/auth" search={{ mode: "signup" }}>
                  <Button size="lg" variant="outline">
                    Kom i gang gratis
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Popular listings carousel — desktop only */}
          <div className="hidden md:block">
            <PopularCarousel />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-3xl tracking-tight">
              {activeCategory ? activeCategory.name_nb : "Utforsk kategorier"}
            </h2>
            <p className="mt-1 text-muted-foreground">
              {activeCategory
                ? "Velg en underkategori."
                : "Bla gjennom det folk i nærheten selger akkurat nå."}
            </p>
          </div>
          {activeCategory && (
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition hover:border-primary hover:text-primary"
            >
              <ChevronLeft className="size-4" />
              Tilbake
            </button>
          )}
        </div>

        {/* Mobil: horisontal sveipbar rad (kun for rotkategorier) */}
        {!activeCategory && (
          <div className="-mx-4 duration-300 animate-in fade-in slide-in-from-left-8 sm:hidden">
            <div
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain touch-pan-x px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {rootCategories.length === 0 &&
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-24 w-20 shrink-0 animate-pulse rounded-2xl bg-muted" />
                ))}
              {rootCategories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.slug] ?? Package;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handlePickCategory(cat)}
                    className="group flex w-20 shrink-0 snap-start flex-col items-center gap-2 active:opacity-80"
                  >
                    <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-7" />
                    </span>
                    <span className="line-clamp-2 text-pretty text-center text-xs font-medium leading-tight">
                      {cat.name_nb}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          key={activeCategory?.id ?? "root"}
          className={`grid grid-cols-2 gap-3 duration-300 animate-in fade-in sm:grid-cols-3 lg:grid-cols-4 ${activeCategory ? "slide-in-from-right-8" : "hidden sm:grid slide-in-from-left-8"}`}
        >
          {activeCategory ? (
            (() => {
              const subs = childrenByParent.get(activeCategory.id) ?? [];
              const allSlugs = [activeCategory.slug, ...subs.map((s) => s.slug)];

              return (
                <>
                  <Link
                    to="/annonser"
                    search={{
                      q: "",
                      category: "",
                      categories: allSlugs,
                      catMode: "any",
                      sort: "new",
                    }}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-primary bg-primary/5 px-4 py-5 text-left font-medium text-primary transition hover:bg-primary hover:text-primary-foreground hover:shadow-sm"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="truncate">Alt i {activeCategory.name_nb}</div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 transition group-hover:translate-x-0.5" />
                  </Link>
                  {subs.map((sub) => (
                    <Link
                      key={sub.id}
                      to="/annonser"
                      search={{ q: "", category: sub.slug, sort: "new" }}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-5 text-left transition hover:border-primary hover:shadow-sm"
                    >
                      <div className="truncate font-medium">{sub.name_nb}</div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  ))}
                  {subs.length === 0 && (
                    <p className="col-span-full text-sm text-muted-foreground">
                      Ingen underkategorier — trykk over for å se alle annonser.
                    </p>
                  )}
                </>
              );
            })()
          ) : (
            <>
              {rootCategories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.slug] ?? Package;
                const subCount = childrenByParent.get(cat.id)?.length ?? 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handlePickCategory(cat)}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-5 text-left transition hover:border-primary hover:shadow-sm"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{cat.name_nb}</div>
                        {subCount > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {subCount} underkategorier
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                );
              })}
              {!categories && (
                <div className="col-span-full text-sm text-muted-foreground">
                  Laster kategorier…
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Populært akkurat nå — mobil/tablet under kategorier */}
      <section className="mx-auto max-w-6xl px-4 pb-16 md:hidden">
        <PopularCarousel />
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
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">
                Et alternativ vi bygger sammen.
              </h2>
              <p className="mt-3 max-w-xl opacity-90">
                Kaupet.no bygges åpent på GitHub. Frivillige utviklere og designere er hjertelig
                velkomne.
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
