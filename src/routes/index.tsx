import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  FolderOpen,
  Heart,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import { z } from "zod";
import { useMemo, useRef, useState } from "react";
import Autoplay from "embla-carousel-autoplay";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { KaupetCodeDialog } from "@/components/kaupet-code-dialog";
import { getCategoryIcon } from "@/lib/category-icons";
import { findCategorySuggestion } from "@/lib/categories";
import { useTypewriterText } from "@/lib/use-typewriter-text";
import { SEARCH_SUGGESTIONS } from "@/lib/search-suggestions";

type CategoryRow = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  icon: string | null;
};

const searchSchema = z.object({
  q: z.string().optional(),
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

// Defined at module scope (not inside WebLanding's render body) so it keeps
// a stable component identity across re-renders — e.g. while the hero's
// typewriter placeholder updates state every ~40-90ms. A component defined
// inline inside another component's render is a *new* function on every
// render, which makes React unmount and remount the whole subtree (every
// <img> included) instead of just re-rendering it, causing visible flicker.
function PopularCarousel({
  popular,
  autoplay,
}: {
  popular: ListingCardData[] | undefined;
  autoplay: React.RefObject<ReturnType<typeof Autoplay>>;
}) {
  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl tracking-tight">Populært akkurat nå</h2>
        <Link
          to="/annonser"
          search={{ q: "", category: "", sort: "new" }}
          className="text-sm text-primary hover:underline"
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
              <CarouselItem
                key={listing.id}
                className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5"
              >
                <ListingCard listing={listing} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="-left-3" />
          <CarouselNext className="-right-3" />
        </Carousel>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
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
        .select("id, slug, name_nb, parent_id, icon")
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
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const [qFocused, setQFocused] = useState(false);
  const typewriterPlaceholder = useTypewriterText(SEARCH_SUGGESTIONS, {
    paused: qFocused || qDraft.length > 0,
  });

  // Suggest a matching category while the user types in the hero search, so
  // people who type a category name (e.g. "sykkel") discover that browsing by
  // category is also possible from the same field.
  const heroSuggestion = useMemo(
    () => findCategorySuggestion(categories ?? [], qDraft),
    [qDraft, categories],
  );

  const goToCategory = (cat: CategoryRow) => {
    navigate({ to: "/annonser", search: { q: "", category: cat.slug, sort: "new" } });
  };

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
    queryKey: ["popular-listings-last-week"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("popular_listings_last_week", { _limit: 8 });
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => ({
        id: l.listing_id,
        kaupet_code: l.kaupet_code,
        title: l.title,
        price_nok: l.price_nok,
        is_free: l.is_free,
        city: l.city,
        created_at: l.created_at,
        cover_path: l.cover_path,
        total_views: Number(l.total_views ?? 0),
        views_last_week: Number(l.views_last_week ?? 0),
      }));
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
      {/* Hero — søkefeltet får all oppmerksomheten, som en søkemotor */}
      <section className="relative overflow-hidden bg-surface">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center md:py-24">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Gi tingene dine <span className="italic text-accent">et nytt liv</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
            Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen
            mellomledd, ingen reklame.
          </p>

          <form onSubmit={submitSearch} className="mx-auto mt-8 flex max-w-lg gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onFocus={() => setQFocused(true)}
                onBlur={() => setQFocused(false)}
                placeholder={typewriterPlaceholder}
                className="h-12 border-border bg-card pl-9 text-base shadow-md"
                aria-label="Søk i annonser"
              />
              {qFocused && heroSuggestion && (
                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-full overflow-hidden rounded-xl border border-border bg-card p-1 text-left shadow-md">
                  <button
                    type="button"
                    // Mouse-down fires before the input's blur, so the click
                    // registers instead of being lost when focus leaves the field.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goToCategory(heroSuggestion);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                    <span>
                      Gå til kategori: <span className="font-medium">{heroSuggestion.name_nb}</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <Button type="submit" size="lg" className="gap-2">
              Søk <ArrowRight className="size-4" />
            </Button>
          </form>

          {/* "Utforsk kategorier" — slider rett under knappen, ikke en egen
              seksjon lenger ned, så sammenhengen mellom trykk og resultat er
              tydelig. */}
          <Collapsible
            open={categoriesOpen}
            onOpenChange={(o) => {
              setCategoriesOpen(o);
              if (!o) setActiveCategory(null);
            }}
          >
            <div className="flex justify-center">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <FolderOpen className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5" />
                  Utforsk kategorier
                  <ChevronDown className="size-3.5 transition-transform duration-200 group-hover:translate-y-0.5 group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <div className="mx-auto mt-3 max-w-xl rounded-2xl border border-border bg-card p-4 text-left shadow-sm">
                {activeCategory && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory(null)}
                    className="mb-3 flex items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                  >
                    <ChevronLeft className="size-3.5" />
                    Tilbake til hovedkategorier
                  </button>
                )}

                <div
                  key={activeCategory?.id ?? "root"}
                  className={`grid grid-cols-3 gap-1 duration-200 animate-in fade-in sm:grid-cols-4 md:grid-cols-6 ${activeCategory ? "slide-in-from-right-4" : "slide-in-from-left-4"}`}
                >
                  {activeCategory ? (
                    (() => {
                      const subs = childrenByParent.get(activeCategory.id) ?? [];
                      const allSlugs = [activeCategory.slug, ...subs.map((s) => s.slug)];
                      const AllIcon = getCategoryIcon(activeCategory.icon);

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
                            className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-muted"
                          >
                            <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <AllIcon className="size-5" />
                            </span>
                            <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight">
                              Alt i {activeCategory.name_nb}
                            </span>
                          </Link>
                          {subs.map((sub) => {
                            const Icon = getCategoryIcon(sub.icon);
                            return (
                              <Link
                                key={sub.id}
                                to="/annonser"
                                search={{ q: "", category: sub.slug, sort: "new" }}
                                className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-muted"
                              >
                                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                                  <Icon className="size-5" />
                                </span>
                                <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight">
                                  {sub.name_nb}
                                </span>
                              </Link>
                            );
                          })}
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
                      {rootCategories.length === 0 &&
                        Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="aspect-square animate-pulse rounded-xl bg-muted"
                          />
                        ))}
                      {rootCategories.map((cat) => {
                        const Icon = getCategoryIcon(cat.icon);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => handlePickCategory(cat)}
                            className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-muted"
                          >
                            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                              <Icon className="size-5" />
                            </span>
                            <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight">
                              {cat.name_nb}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
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
            <KaupetCodeDialog />
          </div>
        </div>
      </section>

      {/* Populært akkurat nå — egen seksjon, lenger ned slik at søkefeltet
          eier hero-seksjonen alene */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <PopularCarousel popular={popular} autoplay={autoplay} />
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
