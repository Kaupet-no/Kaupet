import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderOpen, Heart, MapPin, Search, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useMemo, useRef, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import { OnboardingFlow } from "@/components/onboarding-flow";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdPickerOptions } from "@/components/ad-picker-options";
import { getCategoryIcon } from "@/lib/category-icons";
import { findCategorySuggestion } from "@/lib/categories";
import { Badge } from "@/components/ui/badge";
import { useTypewriterText } from "@/lib/use-typewriter-text";
import { SEARCH_SUGGESTIONS } from "@/lib/search-suggestions";
import { categoryHeadingFontStack } from "@/lib/category-fonts";
import { CategoryFilterFields } from "@/components/category-filter-fields";
import {
  effectiveFiltersForCategory,
  normalizeFilter,
  type AttributeFilterValue,
} from "@/lib/category-filters";

type CategoryRow = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  heading_font: string | null;
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
  const [onboardingDone, setOnboardingDone] = useState(
    () => localStorage.getItem("kaupet_onboarding_completed_v1") === "true",
  );

  if (native && !onboardingDone) {
    return (
      <OnboardingFlow
        onComplete={() => {
          localStorage.setItem("kaupet_onboarding_completed_v1", "true");
          setOnboardingDone(true);
        }}
      />
    );
  }

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
  isError,
  onRetry,
  autoplay,
}: {
  popular: ListingCardData[] | undefined;
  isError: boolean;
  onRetry: () => void;
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

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Klarte ikke å hente populære annonser akkurat nå.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Prøv igjen
          </Button>
        </div>
      ) : popular && popular.length > 0 ? (
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [adPickerOpen, setAdPickerOpen] = useState(false);
  const [qDraft, setQDraft] = useState("");
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: true }));

  const {
    data: categories,
    isError: categoriesIsError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color, heading_font")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const { data: allFilters } = useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  // Only colored root categories are presented as main categories on the landing
  // page; the catch-all "Annet" (no color) stays reachable via search but is not
  // shown here.
  const rootCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parent_id === null && !!c.color),
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
  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryRow>();
    for (const c of categories ?? []) map.set(c.id, c);
    return map;
  }, [categories]);

  // Path of categories drilled into so far, root-first (e.g. [Klær og mote,
  // Herreklær, Bukse]). Only the root carries a presentation color/font, so
  // the hero heading always tracks path[0], while the subcategory grid and
  // filters below track the deepest selected level.
  const [selectedPath, setSelectedPath] = useState<CategoryRow[]>([]);
  const activeCategory = selectedPath[0] ?? null;
  const currentParent = selectedPath[selectedPath.length - 1] ?? null;
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // Tracks which way the subcategory list/filter panel should slide in, so
  // drilling deeper feels like moving forward (from the right) and going
  // back feels like retreating (from the left) — matching the hero swap.
  const [navDirection, setNavDirection] = useState<"forward" | "back">("forward");
  const [filterValues, setFilterValues] = useState<Record<string, AttributeFilterValue>>({});
  const subcatRef = useRef<HTMLDivElement>(null);

  // Filters configured for the deepest selected category (inherited up the
  // chain), shown below its subcategories so the user can narrow the search
  // before browsing — e.g. clothing size on "Bukse", screen size on "TV".
  const activeFilters = useMemo(
    () => effectiveFiltersForCategory(currentParent?.id ?? null, allFilters ?? [], categoriesById),
    [currentParent, allFilters, categoriesById],
  );

  const [qFocused, setQFocused] = useState(false);
  // When a category is active, hint at what's searchable within it by typing
  // its (deepest-level) subcategory names instead of the generic suggestions.
  const typewriterWords = useMemo(() => {
    if (!currentParent) return SEARCH_SUGGESTIONS;
    const subs = childrenByParent.get(currentParent.id) ?? [];
    const words = subs.map((s) => s.name_nb.toLocaleLowerCase("nb-NO"));
    return words.length > 0 ? words : [currentParent.name_nb.toLocaleLowerCase("nb-NO")];
  }, [currentParent, childrenByParent]);
  const typewriterPlaceholder = useTypewriterText(typewriterWords, {
    paused: qFocused || qDraft.length > 0,
    resetKey: currentParent?.id ?? "all",
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
    // Clicking the already-active root category again closes it and returns
    // the landing page to its default state, instead of just re-selecting it.
    if (activeCategory?.id === cat.id) {
      setSelectedPath([]);
      setFilterValues({});
      setCategoriesOpen(false);
      return;
    }
    const subs = childrenByParent.get(cat.id) ?? [];
    if (subs.length === 0) {
      goToCategory(cat);
      return;
    }
    setSelectedPath([cat]);
    setFilterValues({});
    setCategoriesOpen(true);
    setNavDirection("forward");
    // Scroll so the newly revealed subcategories are visible after the slide-down.
    requestAnimationFrame(() => {
      setTimeout(
        () => subcatRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        80,
      );
    });
  };

  // Drill one level deeper from the subcategory grid — whether or not `sub`
  // turns out to have children of its own, so a leaf like "Bukse" or "TV"
  // still reveals its own filters instead of navigating away immediately.
  const drillIntoSub = (sub: CategoryRow) => {
    setSelectedPath((prev) => [...prev, sub]);
    setFilterValues({});
    setNavDirection("forward");
    requestAnimationFrame(() => {
      setTimeout(
        () => subcatRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        80,
      );
    });
  };

  const goBack = () => {
    if (selectedPath.length > 1) {
      setSelectedPath((prev) => prev.slice(0, -1));
    } else {
      setSelectedPath([]);
      setCategoriesOpen(false);
    }
    setFilterValues({});
    setNavDirection("back");
  };

  const jumpToDepth = (index: number) => {
    setSelectedPath((prev) => prev.slice(0, index + 1));
    setFilterValues({});
    setNavDirection("back");
  };

  // Shared look for every main-category icon — same neutral color regardless
  // of the category, so the row reads as one consistent set rather than a
  // rainbow of per-category accents.
  const renderCategoryIcon = (cat: CategoryRow) => {
    const Icon = getCategoryIcon(cat.icon);
    const active = activeCategory?.id === cat.id;
    return (
      <button
        key={cat.id}
        type="button"
        onClick={() => handlePickCategory(cat)}
        aria-expanded={active}
        className="group flex w-16 flex-col items-center gap-1.5 text-center"
      >
        <span
          className={`flex size-10 items-center justify-center rounded-full transition ${
            active
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
          }`}
        >
          <Icon className="size-4" />
        </span>
        <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight text-foreground">
          {cat.name_nb}
        </span>
      </button>
    );
  };

  const {
    data: popular,
    isError: popularIsError,
    refetch: refetchPopular,
  } = useQuery({
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
    // When a main category is active, scope the search to just that category
    // — /annonser already expands a parent category to include all of its
    // children server-side, so listing it alone (not every subcategory
    // slug too) is both sufficient and what the filter UI should display.
    navigate({
      to: "/annonser",
      search: { q: qDraft.trim(), category: activeCategory?.slug ?? "", sort: "new" },
    });
  };

  return (
    <div>
      {/* Hero — søkefeltet får all oppmerksomheten, som en søkemotor */}
      <section className="relative overflow-hidden bg-surface">
        {/* Per-category background tint that animates in from the left when a
            main category is selected. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 origin-left transition-[transform,background-color,opacity] duration-700 ease-out"
          style={{
            background: activeCategory?.color ?? "transparent",
            opacity: activeCategory ? 0.16 : 0,
            transform: activeCategory ? "translateX(0)" : "translateX(-100%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-2xl px-4 py-16 text-center md:py-24">
          {/* Hero text and the category heading are mutually exclusive, each
              sliding in from the direction matching the background tint and
              the subcategory grid below, so picking a category visibly moves
              the page into a more focused area. */}
          {activeCategory ? (
            <h1
              key={activeCategory.id}
              className="text-5xl leading-[1.05] tracking-tight duration-700 animate-in fade-in slide-in-from-right-4 md:text-6xl"
              style={{ fontFamily: categoryHeadingFontStack(activeCategory.heading_font) }}
            >
              /{activeCategory.name_nb}
            </h1>
          ) : (
            <div key="hero" className="duration-700 animate-in fade-in slide-in-from-left-4">
              <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
                Gi tingene dine <span className="italic text-accent">et nytt liv</span>.
              </h1>
            </div>
          )}

          <form onSubmit={submitSearch} className="mx-auto mt-8 flex max-w-lg gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onFocus={() => setQFocused(true)}
                onBlur={() => setQFocused(false)}
                placeholder={typewriterPlaceholder ? `f.eks. ${typewriterPlaceholder}` : ""}
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

          {/* Hovedkategorier — på mobil én horisontal, sveipbar rad med
              kant-fade som viser at det finnes flere; fra sm og opp brytes
              raden slik at alle kategoriene alltid er synlige uten scroll.
              Underkategorier ligger bak hvert valg. */}
          <div className="relative mx-auto mt-6 max-w-lg sm:max-w-2xl">
            <div
              className="flex gap-4 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:overflow-visible"
              style={{ scrollSnapType: "x proximity" }}
            >
              {categoriesIsError && (
                <div className="flex w-full flex-col items-center gap-2 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Klarte ikke å hente kategorier.</p>
                  <Button variant="outline" size="sm" onClick={() => void refetchCategories()}>
                    Prøv igjen
                  </Button>
                </div>
              )}
              {!categoriesIsError &&
                rootCategories.length === 0 &&
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                    <div className="size-10 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              {rootCategories.map((cat) => (
                <div key={cat.id} className="shrink-0" style={{ scrollSnapAlign: "start" }}>
                  {renderCategoryIcon(cat)}
                </div>
              ))}
              {/* Alltid synlig inngang til det fulle kategoritreet — dekker
                  også kategorier uten farge (f.eks. "Annet") som ikke vises
                  i raden over. */}
              <div className="shrink-0" style={{ scrollSnapAlign: "start" }}>
                <Link
                  to="/annonser"
                  search={{ q: "", category: "", sort: "new" }}
                  className="group flex w-16 flex-col items-center gap-1.5 text-center"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <FolderOpen className="size-4" />
                  </span>
                  <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight text-foreground">
                    Se alle
                  </span>
                </Link>
              </div>
            </div>
            {/* Kant-fade — kun mobil, hinter om at raden kan sveipes videre.
                Skjules mens en kategori er valgt, siden fargen ellers ville
                kollidert med kategoritinten bak. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface to-transparent transition-opacity sm:hidden"
              style={{ opacity: activeCategory ? 0 : 1 }}
            />
          </div>

          <Collapsible
            open={categoriesOpen}
            onOpenChange={(o) => {
              setCategoriesOpen(o);
              if (!o) {
                setSelectedPath([]);
                setFilterValues({});
              }
            }}
          >
            <CollapsibleContent>
              {currentParent && (
                // Underkategorier + filtre — bryter ut av hero-kolonnens
                // max-w-2xl slik at panelet blir like bredt som seksjonene
                // lenger ned på siden (max-w-6xl), og gir filtrene god plass
                // ved siden av listen i stedet for å bli klemt sammen.
                <div
                  className="relative left-1/2 -ml-[50vw] mt-3 w-screen text-left"
                  ref={subcatRef}
                >
                  <div className="mx-auto max-w-6xl px-4">
                    <button
                      type="button"
                      onClick={goBack}
                      className="mb-2 flex items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                    >
                      <ChevronLeft className="size-3.5" />
                      {selectedPath.length > 1
                        ? `Tilbake til ${selectedPath[selectedPath.length - 2].name_nb}`
                        : "Lukk"}
                    </button>

                    {selectedPath.length > 1 && (
                      <div className="mb-3 flex flex-wrap items-center gap-1.5">
                        {selectedPath.map((c, i) => (
                          <Badge
                            key={c.id}
                            variant={i === selectedPath.length - 1 ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() => jumpToDepth(i)}
                          >
                            {c.name_nb}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div
                      key={currentParent.id}
                      className={`duration-700 animate-in fade-in ${
                        navDirection === "forward"
                          ? "slide-in-from-right-4"
                          : "slide-in-from-left-4"
                      }`}
                    >
                      {/* Underkategorier som kompakte tekst-tagger i en rad —
                          bevisst uten ikon-sirkel/farge, så nivået leser som
                          en nedtrapping fra hovedkategori-raden i stedet for
                          en gjentakelse av samme visuelle mønster. */}
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const subs = childrenByParent.get(currentParent.id) ?? [];

                          return (
                            <>
                              <Link
                                to="/$kaupetCode"
                                params={{ kaupetCode: currentParent.slug }}
                                className="rounded-lg border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition"
                              >
                                Alt i {currentParent.name_nb}
                              </Link>
                              {subs.map((sub) => (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() => drillIntoSub(sub)}
                                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground transition hover:border-primary hover:text-primary"
                                >
                                  {sub.name_nb}
                                </button>
                              ))}
                              {subs.length === 0 && (
                                <p className="py-1.5 text-sm text-muted-foreground">
                                  Ingen underkategorier — trykk over for å se alle annonser.
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Filtre for valgt underkategori — under tag-raden,
                          full bredde, så det ikke blir tomrom ved siden av
                          en kompakt tag-rad når det ikke finnes filtre. */}
                      {activeFilters.length > 0 && (
                        <div className="mt-4 space-y-4 border-t border-border pt-4">
                          <CategoryFilterFields
                            filters={activeFilters}
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
                          <Button
                            onClick={() =>
                              navigate({
                                to: "/$kaupetCode",
                                params: { kaupetCode: currentParent.slug },
                                search: { f: filterValues },
                              })
                            }
                          >
                            Vis treff
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {!activeCategory && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {user ? (
                <>
                  <Button size="lg" variant="outline" onClick={() => setAdPickerOpen(true)}>
                    Opprett en annonse
                  </Button>
                  <Dialog open={adPickerOpen} onOpenChange={setAdPickerOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Ny annonse</DialogTitle>
                      </DialogHeader>
                      <AdPickerOptions
                        onSell={() => {
                          setAdPickerOpen(false);
                          void navigate({ to: "/ny-annonse", search: { type: "sell" } });
                        }}
                        onBuy={() => {
                          setAdPickerOpen(false);
                          void navigate({ to: "/ny-ok-annonse" });
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                  <KaupetCodeDialog />
                </>
              ) : (
                <>
                  <KaupetCodeDialog />
                  <div className="relative flex flex-col items-center">
                    <Link to="/auth" search={{ mode: "signup" }}>
                      <Button size="lg" variant="outline">
                        Kom i gang gratis
                      </Button>
                    </Link>
                    {/* Flytende, leken merkelapp — på mobil (stablede knapper) ligger
                      den i normal flyt for å ikke dekke knappen under; fra sm og opp
                      er det rom til å la den flyte fritt over innholdet. */}
                    <div className="pointer-events-none relative mt-3 w-44 rotate-[-3deg] rounded-2xl bg-primary px-3 py-2.5 text-center text-xs font-medium leading-snug text-primary-foreground shadow-lg sm:absolute sm:left-1/2 sm:top-full sm:z-20 sm:mt-3 sm:w-44 sm:-translate-x-1/2">
                      <span className="absolute -top-1.5 left-9 size-3 rotate-45 rounded-[2px] bg-primary" />
                      Det er alltid gratis å annonsere på Kaupet, uansett hva du selger.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Populært akkurat nå — egen seksjon, lenger ned slik at søkefeltet
          eier hero-seksjonen alene */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <PopularCarousel
          popular={popular}
          isError={popularIsError}
          onRetry={() => void refetchPopular()}
          autoplay={autoplay}
        />
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
                Kaupet.no bygges på åpen kildekode, med rett til personvern som et grunnprinsipp. Vi
                benytter derfor ingen sporende informasjonskapsler eller tredjeparts analyseverktøy.
              </p>
              <p>
                Ønsker du å bidra? Sjekk ut repoet på GitHub. Alle bidragsytere er hjertelig
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
